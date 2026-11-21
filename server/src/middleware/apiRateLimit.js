import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { parseRefreshToken, REFRESH_COOKIE } from '../services/authSessionService.js';
import { env } from '../config/env.js';

// General /api rate limit.
//
// 2026-11-13 fix: the limit used to be counted per IP address. The whole office
// shares one public IP (and Company Wi-Fi attendance depends on that), so with
// ~18 staff each keeping the app open (it polls every minute) the office as a
// whole used up 300 requests / 15 min and EVERY request from the office —
// including check-in and check-out — was refused with 429 until the window
// reset. Now each signed-in user has their own allowance, keyed by the user id
// of a VERIFIED token (a made-up token cannot create fresh allowances; it falls
// back to the IP). Anonymous traffic is still limited per IP.

export const API_WINDOW_MS = 15 * 60 * 1000;
export const API_LIMIT = 300;

function tokenFrom(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return req.cookies?.token || null;
}

/** The bucket a request counts against: "user:<id>" for a valid session, else "ip:<address>". */
export function apiRateLimitKey(req) {
  const token = tokenFrom(req);
  if (token) {
    try {
      // Signature checked; an expired token still identifies whose bucket it is
      // (the app refreshes it right after — that should not count against the office IP).
      const { sub } = jwt.verify(token, env.jwtSecret, { ignoreExpiration: true });
      if (sub) return `user:${sub}`;
    } catch {
      // invalid token → count against the IP
    }
  }
  // Session restore (/auth/refresh) carries only the refresh cookie: one bucket per session.
  const sessionId = parseRefreshToken(req.cookies?.[REFRESH_COOKIE])?.sessionId;
  if (sessionId) return `session:${sessionId}`;
  return `ip:${req.ip}`;
}

export function createApiLimiter({ limit = API_LIMIT, windowMs = API_WINDOW_MS, skip } = {}) {
  return rateLimit({
    windowMs,
    limit,
    skip,
    keyGenerator: apiRateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    // JSON like every other API error, so the app shows a clear message (a plain-text
    // body used to surface as "Something went wrong").
    handler: (req, res, _next, options) =>
      res.status(options.statusCode).json({ success: false, message: 'Too many requests right now. Please wait a minute and try again.' }),
  });
}
