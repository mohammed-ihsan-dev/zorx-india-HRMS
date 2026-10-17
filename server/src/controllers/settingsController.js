import { OfficeSettings } from '../models/OfficeSettings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/auditService.js';
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
