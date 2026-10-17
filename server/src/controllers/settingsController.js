import { OfficeSettings } from '../models/OfficeSettings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/auditService.js';
import { runMailDiagnostic } from '../services/mailService.js';
import { env } from '../config/env.js';
import { parseAllowlist, isIpAllowed } from '../utils/networkAllowlist.js';
import { ATTENDANCE_VERIFICATION_MODE } from '../utils/constants.js';

export const getOfficeSettings = asyncHandler(async (req, res) => {
  const settings = await OfficeSettings.getSingleton();
  sendSuccess(res, { data: settings });
});

export const updateOfficeSettings = asyncHandler(async (req, res) => {
  const settings = await OfficeSettings.getSingleton();

  // Never let Company Wi-Fi mode be switched on while the server-side allowlist
  // is missing or invalid — that would silently block every office check-in.
  const enablingWifi =
    req.body.attendanceVerificationMode === ATTENDANCE_VERIFICATION_MODE.WIFI &&
    settings.attendanceVerificationMode !== ATTENDANCE_VERIFICATION_MODE.WIFI;
  if (enablingWifi) {
    const allowlist = parseAllowlist(env.attendanceNetwork.allowedIps);
    if (!allowlist.ok) {
      throw ApiError.badRequest(
        'Company Wi-Fi attendance cannot be enabled yet: the company network IPs are not configured on the server ' +
          '(ATTENDANCE_WIFI_ALLOWED_IPS). Attendance stays on GPS.',
        { formErrors: allowlist.errors }
      );
    }
  }

  const previousMode = settings.attendanceVerificationMode;
  Object.assign(settings, req.body, { updatedBy: req.user._id });
  await settings.save();

  await recordAudit({
    actorId: req.user._id,
    action: 'OFFICE_SETTINGS_CHANGED',
    targetType: 'OfficeSettings',
    targetId: settings._id,
    description:
      previousMode !== settings.attendanceVerificationMode
        ? `Updated office settings (attendance verification: ${previousMode} → ${settings.attendanceVerificationMode})`
        : 'Updated office settings',
    metadata: req.body,
  });

  sendSuccess(res, { message: 'Office settings updated successfully.', data: settings });
});

/**
 * Admin-only diagnostic: what the server sees for THIS request. Open it from a
 * device on the office Wi-Fi to confirm the detected IP is the office's public
 * IP (and not a proxy/CDN address) before enabling Company Wi-Fi attendance.
 */
export const getAttendanceNetworkDiagnostics = asyncHandler(async (req, res) => {
  const allowlist = parseAllowlist(env.attendanceNetwork.allowedIps);
  const header = (name) => req.get(name) || null;
  sendSuccess(res, {
    data: {
      detectedIp: req.ip,
      proxyChain: req.ips,
      trustProxy: String(env.attendanceNetwork.trustProxy),
      headers: {
        'x-forwarded-for': header('x-forwarded-for'),
        'cf-connecting-ip': header('cf-connecting-ip'),
        'true-client-ip': header('true-client-ip'),
        'x-real-ip': header('x-real-ip'),
      },
      allowlist: { configured: allowlist.ok, entryCount: allowlist.entries.length, errors: allowlist.errors },
      detectedIpAllowed: isIpAllowed(req.ip, allowlist),
    },
  });
});

/**
 * Admin-only email check run on the server's real environment (e.g. Render):
 * one test email via the configured provider (Resend API or SMTP) to the
 * requesting admin's own address (never an arbitrary recipient). Returns
 * sanitized results only.
 */
const MAIL_TEST_COOLDOWN_MS = 30_000;
const lastMailTestAt = new Map(); // per admin, in-memory: limits repeat clicks

export const testEmailDelivery = asyncHandler(async (req, res) => {
  const key = String(req.user._id);
  const now = Date.now();
  const last = lastMailTestAt.get(key) || 0;
  if (now - last < MAIL_TEST_COOLDOWN_MS) {
    const wait = Math.ceil((MAIL_TEST_COOLDOWN_MS - (now - last)) / 1000);
    throw new ApiError(429, `Please wait ${wait}s before sending another test email.`);
  }
  // Claimed before sending, so simultaneous clicks can't both send.
  lastMailTestAt.set(key, now);
  const result = await runMailDiagnostic(req.user.email);
  sendSuccess(res, { data: result });
});
