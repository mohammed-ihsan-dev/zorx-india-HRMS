import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { User } from '../models/User.js';
import { Employee } from '../models/Employee.js';
import { USER_STATUS } from '../utils/constants.js';
import { isVirtualTestUserEnabled, buildVirtualUser, VIRTUAL_USER_ID } from '../utils/virtualTestUser.js';
import { getCachedPrincipal, setCachedPrincipal, principalCacheGeneration } from '../services/principalCache.js';

/**
 * Two kinds of bearer token are accepted:
 *  - access token (typ "access", carries `sid`): 15 minutes, issued by
 *    /auth/login and /auth/refresh to the current app, kept in memory only;
 *  - legacy token (no typ): the 8-hour token issued before persistent sessions,
 *    still issued to app versions cached from before (env.auth.legacyLoginTokens)
 *    and accepted until it expires.
 * Either way the account is re-checked on every request: active status, password
 * reset and "sign out everywhere" (tokens issued before them are refused).
 */

/** Legacy 8-hour token (app versions from before persistent sessions). */
export function signToken(user, extraClaims = {}) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, ...extraClaims }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

/** Short-lived access token bound to a session. Returns { token, expiresAt }. */
export function signAccessToken(user, sessionId, extraClaims = {}) {
  const token = jwt.sign({ sub: user._id.toString(), role: user.role, sid: sessionId ? String(sessionId) : undefined, typ: 'access', ...extraClaims }, env.jwtSecret, {
    expiresIn: env.auth.accessTokenTtl,
  });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000) };
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  return null;
}

/** Verifies a bearer token; throws 401 with a code the app uses to decide between "refresh" and "sign in". */
export function verifyBearer(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Your session has expired. Please log in again.', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Your session is invalid. Please log in again.', 'TOKEN_INVALID');
  }
}

/**
 * The account behind a token, as fresh Mongoose documents (User with employeeId
 * populated). User and Employee are read in parallel — one database round trip —
 * and briefly cached (services/principalCache.js).
 */
export async function loadPrincipal(userId, { useCache = true } = {}) {
  const hit = useCache ? getCachedPrincipal(userId) : null;
  let userObj = hit?.user;
  let employeeObj = hit?.employee;
  if (!hit) {
    const gen = principalCacheGeneration();
    [userObj, employeeObj] = await Promise.all([
      User.findById(userId).lean(),
      Employee.findOne({ userId }).lean(),
    ]);
    if (!userObj) return null;
    // The account's own link wins: if it points elsewhere (or nowhere), read exactly that.
    if (String(employeeObj?._id ?? '') !== String(userObj.employeeId ?? '')) {
      employeeObj = userObj.employeeId ? await Employee.findById(userObj.employeeId).lean() : null;
    }
    setCachedPrincipal(userId, gen, userObj, employeeObj);
  }
  // Deep copies: a request can never change the cached objects (or another request's).
  const user = User.hydrate(deepCopy(userObj));
  if (employeeObj) user.employeeId = Employee.hydrate(deepCopy(employeeObj));
  return user;
}

const deepCopy = (obj) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(obj));

/** Throws unless the account may act with a token issued at `iat` (seconds). */
export function assertPrincipalUsable(user, iat) {
  if (!user) throw ApiError.unauthorized('Your session is invalid. Please log in again.', 'SESSION_INVALID');
  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('Your account is not active. Please contact HR/Admin.');
  }
  // A password reset signs out every session issued before it (JWT iat is in
  // whole seconds, so compare at that precision).
  if (user.passwordChangedAt && iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw ApiError.unauthorized('Your password was reset. Please log in again.', 'SESSION_INVALID');
  }
  if (user.sessionsRevokedAt && iat < Math.floor(user.sessionsRevokedAt.getTime() / 1000)) {
    throw ApiError.unauthorized('You were signed out. Please log in again.', 'SESSION_INVALID');
  }
}

const FIRST_LOGIN_ALLOWED = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout', '/api/auth/logout-all']);

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    throw ApiError.unauthorized('You must be logged in to access this resource.', 'TOKEN_MISSING');
  }

  const payload = verifyBearer(token);
  if (payload.typ && payload.typ !== 'access') {
    throw ApiError.unauthorized('Your session is invalid. Please log in again.', 'TOKEN_INVALID');
  }

  // Virtual test sessions never touch the real User collection — re-checked
  // on every request (not just at login), so disabling TEST_USER_ENABLED
  // immediately invalidates any already-issued virtual token too.
  if (payload.isVirtualTestUser) {
    if (!isVirtualTestUserEnabled() || payload.sub !== VIRTUAL_USER_ID.toString()) {
      throw ApiError.unauthorized('Your session is invalid. Please log in again.', 'TOKEN_INVALID');
    }
    req.user = buildVirtualUser();
    return next();
  }

  const user = await loadPrincipal(payload.sub);
  assertPrincipalUsable(user, payload.iat);

  if (user.mustChangePassword) {
    // Exactly these endpoints (a substring match let e.g. /attendance/me/today through).
    const path = (req.originalUrl || req.path || '').split('?')[0].replace(/\/+$/, '');
    if (!FIRST_LOGIN_ALLOWED.has(path)) {
      throw ApiError.forbidden('First login password change required. Please update your password to proceed.');
    }
  }

  req.user = user;
  req.auth = { sessionId: payload.sid || null, iat: payload.iat, legacy: !payload.typ };
  next();
});
