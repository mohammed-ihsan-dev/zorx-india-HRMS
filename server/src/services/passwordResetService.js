import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { ApiError } from '../utils/ApiError.js';
import { USER_STATUS } from '../utils/constants.js';
import { env } from '../config/env.js';
import { sendMail } from './mailService.js';
import { recordAudit } from './auditService.js';

export const RESET_TOKEN_TTL_MINUTES = 30;
const INVALID_LINK = 'This reset link is invalid or has expired. Please request a new one.';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Starts a reset for an ACTIVE account with this email. Silent no-op for
 * unknown/inactive emails — the caller always answers generically, so the
 * endpoint can't be used to discover which emails have accounts.
 */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email: email.trim().toLowerCase(), status: USER_STATUS.ACTIVE });
  if (!user) return;

  const token = crypto.randomBytes(32).toString('hex');
  // One live link per account: a new request cancels any earlier link.
  await PasswordResetToken.deleteMany({ userId: user._id });
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
  });

  const link = `${env.appUrl}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your ZORX INDIA HRMS password',
    text:
      `We received a request to reset the password for your ZORX INDIA HRMS account.\n\n` +
      `Reset your password using this link (valid for ${RESET_TOKEN_TTL_MINUTES} minutes, single use):\n${link}\n\n` +
      `If you didn't request this, you can ignore this email — your password won't change.`,
    html:
      `<p>We received a request to reset the password for your ZORX INDIA HRMS account.</p>` +
      `<p><a href="${link}">Reset your password</a></p>` +
      `<p>This link is valid for ${RESET_TOKEN_TTL_MINUTES} minutes and can be used once.</p>` +
      `<p>If you didn't request this, you can ignore this email — your password won't change.</p>`,
  });
}

async function findUsableToken(token) {
  const record = await PasswordResetToken.findOne({ tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } });
  if (!record) return null;
  const user = await User.findOne({ _id: record.userId, status: USER_STATUS.ACTIVE });
  return user ? { record, user } : null;
}

export async function isResetTokenValid(token) {
  return Boolean(await findUsableToken(token));
}

/** Sets the new password, consumes the token atomically and signs out older sessions. */
export async function resetPassword(token, newPassword) {
  const found = await findUsableToken(token);
  if (!found) throw ApiError.badRequest(INVALID_LINK);

  // Atomic claim: of two simultaneous submissions with the same link, only one succeeds.
  const claimed = await PasswordResetToken.findOneAndUpdate(
    { _id: found.record._id, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } }
  );
  if (!claimed) throw ApiError.badRequest(INVALID_LINK);

  const user = await User.findById(found.user._id).select('+passwordHash');
  user.passwordHash = await User.hashPassword(newPassword);
  user.mustChangePassword = false;
  user.passwordChangedAt = new Date();
  await user.save();
  await PasswordResetToken.deleteMany({ userId: user._id, _id: { $ne: claimed._id } });

  await recordAudit({
    actorId: user._id,
    action: 'PASSWORD_RESET',
    targetType: 'User',
    targetId: user._id,
    description: 'Password reset via forgot-password link',
  });
}
