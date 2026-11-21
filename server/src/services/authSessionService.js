import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AuthSession } from '../models/AuthSession.js';

/**
 * Persistent sign-in ("Keep me signed in for up to 30 days").
 *
 *  - Refresh token = `<sessionId>.<32 random bytes, base64url>`, sent only as an
 *    httpOnly cookie scoped to /api/auth. The database keeps a SHA-256 hash.
 *  - Every refresh ROTATES the secret. The session's absolute end (expiresAt) is
 *    fixed when the password is verified and is never extended.
 *  - Concurrency: two tabs can refresh at the same moment with the same cookie.
 *    The one that loses the race presents the just-replaced secret; within
 *    ROTATION_GRACE_MS that is accepted (and rotated again). Outside it, or for
 *    any older secret, the token has been stolen or replayed: the whole session
 *    is revoked ("reuse detection").
 *  - Rotation is a compare-and-set on tokenHash, so two concurrent refreshes can
 *    never both "win" with the same secret.
 */

export const REFRESH_COOKIE = 'zorx_rt';
export const REFRESH_COOKIE_PATH = '/api/auth';
export const ROTATION_GRACE_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const sessionMaxMs = () => env.auth.sessionMaxDays * DAY_MS;

const hash = (secret) => crypto.createHash('sha256').update(secret).digest('base64url');
const newSecret = () => crypto.randomBytes(32).toString('base64url');
const sameHash = (a, b) => Boolean(a && b) && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** `<sessionId>.<secret>` → { sessionId, secret }, or null for anything malformed. */
export function parseRefreshToken(value) {
  if (typeof value !== 'string' || value.length > 200) return null;
  const [sessionId, secret, extra] = value.split('.');
  if (extra !== undefined || !secret || secret.length < 40 || !mongoose.isValidObjectId(sessionId)) return null;
  return { sessionId, secret };
}

/**
 * Starts a session after the password was verified at `authenticatedAt`
 * (now, or when an upgraded legacy token was issued). Returns { session, refreshToken }.
 */
export async function createSession(userId, { authenticatedAt = new Date(), userAgent = '' } = {}) {
  const secret = newSecret();
  const session = await AuthSession.create({
    userId,
    tokenHash: hash(secret),
    authenticatedAt,
    expiresAt: new Date(authenticatedAt.getTime() + sessionMaxMs()),
    userAgent: String(userAgent || '').slice(0, 300),
  });
  return { session, refreshToken: `${session._id}.${secret}` };
}

export class RefreshError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason; // 'missing' | 'invalid' | 'expired' | 'revoked' | 'reused'
  }
}

/**
 * Verifies a refresh token and rotates it. Returns { session, refreshToken, loaded }.
 * `load(userId)` (optional) runs in parallel with the rotation write, so the caller's
 * account lookup costs no extra round trip; its result is `loaded`.
 * Throws RefreshError when the session cannot continue (the caller clears the cookie).
 */
export async function rotateSession(rawToken, { now = new Date(), attempt = 0, load = null } = {}) {
  const parsed = parseRefreshToken(rawToken);
  if (!parsed) throw new RefreshError(rawToken ? 'invalid' : 'missing');
  const session = await AuthSession.findById(parsed.sessionId).lean();
  if (!session) throw new RefreshError('invalid');
  if (session.revokedAt) throw new RefreshError('revoked');
  if (session.expiresAt <= now) throw new RefreshError('expired');

  const presented = hash(parsed.secret);
  const isCurrent = sameHash(presented, session.tokenHash);
  const isJustReplaced =
    !isCurrent &&
    sameHash(presented, session.previousTokenHash) &&
    session.rotatedAt &&
    now.getTime() - new Date(session.rotatedAt).getTime() <= ROTATION_GRACE_MS;

  if (!isCurrent && !isJustReplaced) {
    // A secret this session no longer accepts: someone is replaying an old cookie.
    await revokeSession(session._id, 'refresh_token_reuse');
    throw new RefreshError('reused');
  }

  const loading = load ? Promise.resolve(load(session.userId)) : Promise.resolve(undefined);
  loading.catch(() => {}); // awaited below; never an unhandled rejection
  const secret = newSecret();
  const updated = await AuthSession.findOneAndUpdate(
    // Compare-and-set: only if nobody rotated it since we read it.
    { _id: session._id, tokenHash: session.tokenHash, revokedAt: null },
    { $set: { tokenHash: hash(secret), previousTokenHash: session.tokenHash, rotatedAt: now, lastUsedAt: now } },
    { new: true, lean: true }
  );
  if (!updated) {
    // Lost a race with another tab that rotated a moment ago — try once more
    // against the fresh state (our secret is now the "just replaced" one).
    if (attempt > 0) throw new RefreshError('invalid');
    return rotateSession(rawToken, { now, attempt: attempt + 1, load });
  }
  return { session: updated, refreshToken: `${session._id}.${secret}`, loaded: await loading };
}

/** Looks up a session from a refresh cookie without rotating it (for logout). */
export async function findSessionByToken(rawToken) {
  const parsed = parseRefreshToken(rawToken);
  if (!parsed) return null;
  const session = await AuthSession.findById(parsed.sessionId).lean();
  if (!session) return null;
  const presented = hash(parsed.secret);
  return sameHash(presented, session.tokenHash) || sameHash(presented, session.previousTokenHash) ? session : null;
}

export async function revokeSession(sessionId, reason = 'logout') {
  if (!sessionId || !mongoose.isValidObjectId(sessionId)) return;
  await AuthSession.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
}

/** Ends every session of a user (logout everywhere, password reset, deactivation), optionally keeping one. */
export async function revokeAllSessions(userId, reason, { exceptSessionId = null } = {}) {
  if (!userId) return 0;
  const filter = { userId, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  const { modifiedCount } = await AuthSession.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } });
  return modifiedCount;
}

/** Cookie options for the refresh token; `expires` is the session's absolute end. */
export function refreshCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: env.auth.cookieSecure,
    // www.zorxindia.online and api.zorxindia.online are the same site, so a
    // Strict cookie is still sent on the app's own API calls, and never on
    // requests started by any other site.
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
  };
}
