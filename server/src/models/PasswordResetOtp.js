import mongoose from 'mongoose';

// One active password-recovery record per user. Neither the OTP nor the reset
// authorization is stored in plaintext — only keyed digests — so a database
// leak can't be used to recover anyone's account.
const passwordResetOtpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    otpDigest: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
    lastSentAt: { type: Date, required: true },
    // Per-account request throttle (rolling window).
    windowStart: { type: Date, required: true },
    requestsInWindow: { type: Number, default: 1 },
    // Issued after a correct OTP; required by the final password-reset step.
    resetDigest: { type: String, default: null },
    resetExpiresAt: { type: Date, default: null },
    resetUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

passwordResetOtpSchema.index({ userId: 1 }, { unique: true });
passwordResetOtpSchema.index({ resetDigest: 1 }, { sparse: true });
// Housekeeping: records disappear a day after their last update. Validity is always checked explicitly.
passwordResetOtpSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const PasswordResetOtp = mongoose.model('PasswordResetOtp', passwordResetOtpSchema);
