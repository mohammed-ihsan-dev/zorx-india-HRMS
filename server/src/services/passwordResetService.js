import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { PasswordResetOtp } from '../models/PasswordResetOtp.js';
import { ApiError } from '../utils/ApiError.js';
import { USER_STATUS } from '../utils/constants.js';
import { env } from '../config/env.js';
import { sendMail } from './mailService.js';
import { recordAudit } from './auditService.js';

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_REQUESTS_PER_HOUR = 5;
export const RESET_AUTH_TTL_MINUTES = 10;

const INVALID_CODE = 'The code is incorrect or has expired. Please try again or request a new code.';
const INVALID_RESET = 'Your password reset session has expired. Please start again.';

// Keyed digests (HMAC with the server secret): stored values are useless without
// the secret, and the OTP digest is bound to its user.
const otpDigest = (userId, otp) => crypto.createHmac('sha256', env.jwtSecret).update(`password-reset-otp:${userId}:${otp}`).digest('hex');
const resetDigest = (token) => crypto.createHmac('sha256', env.jwtSecret).update(`password-reset-auth:${token}`).digest('hex');
const sameDigest = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

/** Cryptographically secure, uniformly distributed 6-digit code (leading zeros allowed). */
export function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

const findActiveUser = (email) => User.findOne({ email: String(email).trim().toLowerCase(), status: USER_STATUS.ACTIVE });

function otpEmail(otp) {
  const minutes = OTP_TTL_MINUTES;
  return {
    subject: `${otp} is your ZORX INDIA password reset code`,
    text:
      `ZORX INDIA HRMS — password reset\n\n` +
      `Your one-time code is: ${otp}\n\n` +
      `It expires in ${minutes} minutes and can be used once.\n` +
      `Do not share this code with anyone — ZORX INDIA staff will never ask for it.\n\n` +
      `If you didn't request a password reset, ignore this email; your password won't change.`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <div style="font-size:22px;font-weight:800;color:#14532d;letter-spacing:1px">ZORX INDIA</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:24px">HRMS · Password reset</div>
        <p style="font-size:15px">Use this one-time code to reset your password:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;text-align:center;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:16px 0;color:#14532d">${otp}</div>
        <p style="font-size:14px">This code expires in <strong>${minutes} minutes</strong> and can be used once.</p>
        <p style="font-size:14px"><strong>Do not share this code</strong> with anyone — ZORX INDIA staff will never ask for it.</p>
        <p style="font-size:13px;color:#64748b">If you didn't request a password reset, you can ignore this email; your password won't change.</p>
      </div>`,
  };
}

/**
 * Issues and emails a new OTP for an ACTIVE account. Silent no-op for unknown or
 * inactive emails, within the 60s resend cooldown, or past the hourly per-account
 * limit — the caller always answers generically, so nothing here can be used to
 * discover which emails have accounts. The OTP goes only to the account's stored email.
 */
export async function requestPasswordReset(email) {
  const user = await findActiveUser(email);
  if (!user) return;

  const now = new Date();
  const existing = await PasswordResetOtp.findOne({ userId: user._id });
  if (existing && now - existing.lastSentAt < OTP_RESEND_COOLDOWN_SECONDS * 1000) return;

  const windowOpen = existing && now - existing.windowStart < 60 * 60 * 1000;
  if (windowOpen && existing.requestsInWindow >= OTP_MAX_REQUESTS_PER_HOUR) return;

  const otp = generateOtp();
  const fields = {
    otpDigest: otpDigest(user._id, otp),
    expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000),
    attempts: 0,
    consumedAt: null,
    lastSentAt: now,
    windowStart: windowOpen ? existing.windowStart : now,
    requestsInWindow: windowOpen ? existing.requestsInWindow + 1 : 1,
    // A new code always cancels the previous code and any reset authorization.
    resetDigest: null,
    resetExpiresAt: null,
    resetUsedAt: null,
  };

  // Atomic: only proceeds if nobody else issued a code since we read it, so
  // simultaneous requests can never produce two live codes.
  let record;
  if (existing) {
    record = await PasswordResetOtp.findOneAndUpdate({ _id: existing._id, lastSentAt: existing.lastSentAt }, { $set: fields }, { new: true });
    if (!record) return;
  } else {
    try {
      record = await PasswordResetOtp.create({ userId: user._id, ...fields });
    } catch (err) {
      if (err?.code === 11000) return;
      throw err;
    }
  }

  const sent = await sendMail({ to: user.email, ...otpEmail(otp) });
  if (!sent) {
    // Undelivered code: make it unusable but keep the record, so the 60s
    // cooldown and the hourly per-account limit still apply — failed sends can
    // never turn into unlimited new codes or provider calls. The user can
    // request a new code once the normal cooldown has passed.
    await PasswordResetOtp.updateOne({ _id: record._id, otpDigest: fields.otpDigest }, { $set: { expiresAt: new Date() } });
  }
}

/**
 * Checks an OTP. Each check consumes one of the code's attempts BEFORE comparing,
 * atomically, so even concurrent guesses can't exceed the limit. A correct code
 * is consumed exactly once and exchanged for a short-lived, single-use reset
 * authorization. Every failure (unknown email included) gives the same message.
 */
export async function verifyOtp(email, otp) {
  const user = await findActiveUser(email);
  if (!user) throw ApiError.badRequest(INVALID_CODE);

  const now = new Date();
  const record = await PasswordResetOtp.findOneAndUpdate(
    { userId: user._id, consumedAt: null, expiresAt: { $gt: now }, attempts: { $lt: OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!record || !sameDigest(otpDigest(user._id, otp), record.otpDigest)) {
    throw ApiError.badRequest(INVALID_CODE);
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const consumed = await PasswordResetOtp.findOneAndUpdate(
    { _id: record._id, consumedAt: null, otpDigest: record.otpDigest },
    { $set: { consumedAt: now, resetDigest: resetDigest(resetToken), resetExpiresAt: new Date(now.getTime() + RESET_AUTH_TTL_MINUTES * 60 * 1000), resetUsedAt: null } }
  );
  if (!consumed) throw ApiError.badRequest(INVALID_CODE);
  return resetToken;
}

/** Sets the new password using a reset authorization; single use, then signs out every older session. */
export async function resetPassword(resetToken, newPassword) {
  const now = new Date();
  const record = await PasswordResetOtp.findOneAndUpdate(
    { resetDigest: resetDigest(resetToken), resetUsedAt: null, resetExpiresAt: { $gt: now } },
    { $set: { resetUsedAt: now } }
  );
  if (!record) throw ApiError.badRequest(INVALID_RESET);

  const user = await User.findOne({ _id: record.userId, status: USER_STATUS.ACTIVE }).select('+passwordHash');
  if (!user) throw ApiError.badRequest(INVALID_RESET);

  user.passwordHash = await User.hashPassword(newPassword);
  user.mustChangePassword = false;
  user.passwordChangedAt = now;
  await user.save();
  await PasswordResetOtp.deleteOne({ _id: record._id });

  await recordAudit({
    actorId: user._id,
    action: 'PASSWORD_RESET',
    targetType: 'User',
    targetId: user._id,
    description: 'Password reset via email OTP',
  });
}
