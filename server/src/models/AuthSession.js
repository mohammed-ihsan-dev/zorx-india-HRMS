import mongoose from 'mongoose';

/**
 * One signed-in device/browser (a "session"). The browser holds the refresh
 * token `<sessionId>.<secret>` in an httpOnly cookie; only SHA-256 hashes of
 * the secret are stored here. See services/authSessionService.js.
 */
const authSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Hash of the refresh secret currently held by the browser.
    tokenHash: { type: String, required: true },
    // Hash of the secret it replaced, accepted only for a few seconds after a
    // rotation (two tabs refreshing at the same moment). Anything older = reuse.
    previousTokenHash: { type: String, default: null },
    rotatedAt: { type: Date, default: null },
    // Absolute end of the session: fixed at sign-in, never extended by refreshing.
    expiresAt: { type: Date, required: true },
    // When the password was verified (for an upgraded legacy session: when the old token was issued).
    authenticatedAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    userAgent: { type: String, default: '' },
    isVirtualTestUser: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Expired sessions are deleted by MongoDB a day after they end.
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const AuthSession = mongoose.model('AuthSession', authSessionSchema);
