import * as passwordResetService from '../services/passwordResetService.js';
import { User } from '../models/User.js';
import { Employee } from '../models/Employee.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken, signAccessToken, verifyBearer, loadPrincipal, assertPrincipalUsable } from '../middleware/auth.js';
import {
  REFRESH_COOKIE,
  RefreshError,
  createSession,
  rotateSession,
  revokeSession,
  revokeAllSessions,
  findSessionByToken,
  refreshCookieOptions,
  sessionMaxMs,
} from '../services/authSessionService.js';
import { buildMyAttendanceToday } from './attendanceController.js';
import { buildMyWfhToday } from './wfhController.js';
import { env } from '../config/env.js';
import { generateEmployeeCode } from './employeeController.js';
import { recordAudit } from '../services/auditService.js';
import { notifyMany } from '../services/notificationService.js';
import { getEffectivePermissions } from '../utils/permissions.js';
import { isOnsiteWorkEligible } from '../services/onsiteWorkService.js';
import { matchesVirtualTestCredentials, buildVirtualUser } from '../utils/virtualTestUser.js';
import { USER_STATUS, ROLES, BACK_OFFICE_ROLES, NOTIFICATION_TYPE } from '../utils/constants.js';

const STATUS_MESSAGES = {
  [USER_STATUS.PENDING_APPROVAL]: 'Your account is awaiting admin approval.',
  [USER_STATUS.REJECTED]: 'Your account has not been approved.',
  [USER_STATUS.SUSPENDED]: 'Your account is currently suspended.',
  [USER_STATUS.INACTIVE]: 'Your account is not active. Please contact HR/Admin.',
};

export const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw ApiError.conflict('An account with this email already exists.');
  }

  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(' ');

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    email: normalizedEmail,
    passwordHash,
    role: ROLES.EMPLOYEE,
    status: USER_STATUS.PENDING_APPROVAL,
  });

  const employeeCode = await generateEmployeeCode();
  const employee = await Employee.create({
    userId: user._id,
    employeeCode,
    firstName,
    lastName,
    joiningDate: new Date(),
  });
  user.employeeId = employee._id;
  await user.save();

  await recordAudit({
    actorId: user._id,
    action: 'ACCOUNT_SIGNUP',
    targetType: 'User',
    targetId: user._id,
    description: `${name} signed up and is awaiting admin approval.`,
  });

  const backOfficeUsers = await User.find({ role: { $in: BACK_OFFICE_ROLES }, status: USER_STATUS.ACTIVE }).select('_id');
  if (backOfficeUsers.length) {
    await notifyMany(
      backOfficeUsers.map((u) => u._id),
      {
        type: NOTIFICATION_TYPE.SIGNUP_SUBMITTED,
        title: 'New account pending approval',
        message: `${name} (${normalizedEmail}) has requested access and is awaiting approval.`,
        link: '/admin/employees',
      }
    );
  }

  sendSuccess(res, {
    statusCode: 201,
    message: 'Account created successfully. Your account is awaiting admin approval.',
  });
});

/** The signed-in account as the app sees it (login, refresh, /auth/me). */
function userPayload(user) {
  return {
    id: user._id,
    email: user.email,
    role: user.role,
    permissions: getEffectivePermissions(user),
    status: user.status,
    mustChangePassword: Boolean(user.mustChangePassword),
    lastLogin: user.lastLogin,
    employee: user.employeeId,
    // Shows the Onsite Work page (display only; every onsite API re-checks).
    onsiteWorkEligible: isOnsiteWorkEligible(user.employeeId?._id || user.employeeId),
    isVirtualTestUser: Boolean(user.isVirtualTestUser),
  };
}

// The current app sends this header; app versions cached from before persistent
// sessions do not, and keep receiving the 8-hour bearer token they understand.
const isSessionClient = (req) => req.get('X-ZORX-Client') === 'session';

function setRefreshCookie(res, refreshToken, expiresAt) {
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(expiresAt));
}
function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}

/** Access token + session info + user, as returned by login / refresh / upgrade. */
function sessionResponse(user, session) {
  const { token, expiresAt } = signAccessToken(user, session?._id);
  return {
    accessToken: token,
    accessTokenExpiresAt: expiresAt,
    sessionExpiresAt: session?.expiresAt || null,
    user: userPayload(user),
  };
}

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email ? email.trim().toLowerCase() : '';

  // Non-persisted virtual test account — checked first, entirely separate
  // from the real User collection. If TEST_USER_ENABLED is off (the
  // default), this always returns false and login falls through to the
  // normal path below, which 401s exactly as it would for any other
  // nonexistent email — no behavior change for real accounts either way.
  // It never gets a stored session (nothing about it is ever written).
  if (matchesVirtualTestCredentials(normalizedEmail, password)) {
    const virtualUser = buildVirtualUser();
    let data;
    if (isSessionClient(req)) {
      const { token, expiresAt } = signAccessToken(virtualUser, null, { isVirtualTestUser: true });
      data = { accessToken: token, accessTokenExpiresAt: expiresAt, sessionExpiresAt: null, user: userPayload(virtualUser) };
    } else {
      data = { token: signToken(virtualUser, { isVirtualTestUser: true }), user: userPayload(virtualUser) };
    }
    return sendSuccess(res, { message: 'Logged in successfully. (Virtual test account.)', data });
  }

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password.');
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden(STATUS_MESSAGES[user.status] || 'Your account is not active. Please contact HR/Admin.');
  }

  // Password check and the employee profile in parallel (one database round trip saved).
  const [isMatch, employee] = await Promise.all([
    user.comparePassword(password),
    user.employeeId ? Employee.findById(user.employeeId) : null,
  ]);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password.');
  }
  if (user.employeeId) user.employeeId = employee; // populated (null if the profile is missing, as before)

  const now = new Date();
  user.lastLogin = now;
  const wantsSession = isSessionClient(req) || !env.auth.legacyLoginTokens;
  const [, created] = await Promise.all([
    User.updateOne({ _id: user._id }, { $set: { lastLogin: now } }),
    wantsSession ? createSession(user._id, { authenticatedAt: now, userAgent: req.get('User-Agent') }) : null,
  ]);

  if (!wantsSession) {
    // App version from before persistent sessions: unchanged response.
    return sendSuccess(res, { message: 'Logged in successfully.', data: { token: signToken(user), user: userPayload(user) } });
  }
  setRefreshCookie(res, created.refreshToken, created.session.expiresAt);
  const data = sessionResponse(user, created.session);
  // An old app version (no header) still reads `token`: give it the access token.
  if (!isSessionClient(req)) data.token = data.accessToken;
  sendSuccess(res, { message: 'Logged in successfully.', data });
});

/**
 * POST /auth/refresh — restores the session from the httpOnly cookie: rotates the
 * refresh token and returns a new 15-minute access token and the user.
 * `?include=today` also returns today's attendance + WFH status, so on opening
 * the app Check-in/Check-out is usable after a single request.
 */
export const refresh = asyncHandler(async (req, res) => {
  let rotated;
  try {
    rotated = await rotateSession(req.cookies?.[REFRESH_COOKIE], { load: (userId) => loadPrincipal(userId, { useCache: false }) });
  } catch (err) {
    if (!(err instanceof RefreshError)) throw err;
    clearRefreshCookie(res);
    throw ApiError.unauthorized(
      err.reason === 'expired' ? 'Your session has ended. Please log in again.' : 'Please log in to continue.',
      'SESSION_ENDED'
    );
  }
  const { session, refreshToken, loaded: user } = rotated;
  try {
    assertPrincipalUsable(user, Math.floor(new Date(session.authenticatedAt).getTime() / 1000));
  } catch (err) {
    // Deactivated, password reset or signed out everywhere since this session began.
    await revokeSession(session._id, 'account_changed');
    clearRefreshCookie(res);
    throw ApiError.unauthorized(err.message, 'SESSION_ENDED');
  }

  setRefreshCookie(res, refreshToken, session.expiresAt);
  const data = sessionResponse(user, session);
  if (req.query.include === 'today' && user.employeeId?._id && !user.mustChangePassword) {
    // Best effort: a failure here never blocks restoring the session (the app loads it normally).
    const [attendanceToday, wfhToday] = await Promise.all([
      buildMyAttendanceToday(user).catch(() => null),
      buildMyWfhToday(user).catch(() => null),
    ]);
    data.today = attendanceToday ? { attendance: attendanceToday, wfh: wfhToday } : null;
  }
  sendSuccess(res, { data });
});

/**
 * POST /auth/session/upgrade — one-time move of a still-valid 8-hour token (saved
 * by an app version from before persistent sessions) to a persistent session.
 * The session counts from when that token was issued (when the password was last
 * entered), never from now, and an expired token is refused: it needs a login.
 */
export const upgradeSession = asyncHandler(async (req, res) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw ApiError.unauthorized('Please log in to continue.', 'SESSION_ENDED');
  const payload = verifyBearer(header.slice('Bearer '.length));
  if (payload.typ || payload.isVirtualTestUser) throw ApiError.unauthorized('Please log in to continue.', 'SESSION_ENDED');

  const user = await loadPrincipal(payload.sub, { useCache: false });
  assertPrincipalUsable(user, payload.iat);
  const authenticatedAt = new Date(payload.iat * 1000);
  if (authenticatedAt.getTime() + sessionMaxMs() <= Date.now()) throw ApiError.unauthorized('Please log in to continue.', 'SESSION_ENDED');

  const { session, refreshToken } = await createSession(user._id, { authenticatedAt, userAgent: req.get('User-Agent') });
  setRefreshCookie(res, refreshToken, session.expiresAt);
  sendSuccess(res, { data: sessionResponse(user, session) });
});

/** POST /auth/logout — ends this browser's session (works even with an expired access token). */
export const logout = asyncHandler(async (req, res) => {
  const fromCookie = await findSessionByToken(req.cookies?.[REFRESH_COOKIE]);
  if (fromCookie) await revokeSession(fromCookie._id, 'logout');
  clearRefreshCookie(res);
  sendSuccess(res, { message: 'Logged out successfully.' });
});

/** POST /auth/logout-all — signs this account out on every device, including this one. */
export const logoutAll = asyncHandler(async (req, res) => {
  if (req.user.isVirtualTestUser) throw ApiError.badRequest('Not available for the virtual test account.');
  await Promise.all([
    revokeAllSessions(req.user._id, 'logout_all'),
    // Also refuses every access token and legacy token already issued.
    User.updateOne({ _id: req.user._id }, { $set: { sessionsRevokedAt: new Date() } }),
  ]);
  clearRefreshCookie(res);
  sendSuccess(res, { message: 'Signed out on all devices.' });
});

export const getMe = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: userPayload(req.user) });
});

export const changePassword = asyncHandler(async (req, res) => {
  if (req.user.isVirtualTestUser) {
    throw ApiError.badRequest('Password changes are not available for the virtual test account.');
  }

  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');

  if (!user.mustChangePassword) {
    if (!currentPassword) {
      throw ApiError.badRequest('Current password is required.');
    }
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw ApiError.badRequest('Current password is incorrect.');
    }
  } else if (currentPassword) {
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw ApiError.badRequest('Current password is incorrect.');
    }
  }

  user.passwordHash = await User.hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();

  // A new password signs out the account's OTHER devices; this one stays signed in.
  await revokeAllSessions(user._id, 'password_changed', { exceptSessionId: req.auth?.sessionId || null });

  sendSuccess(res, { message: 'Password updated successfully.', data: { mustChangePassword: false } });
});

// ---- Forgot password (email OTP) ----
const FORGOT_PASSWORD_REPLY = 'If an account exists for this email address, an OTP will be sent.';

export const forgotPassword = asyncHandler(async (req, res) => {
  // Reply immediately and identically for every email; the OTP work runs
  // afterwards so neither the message nor the response time reveals whether
  // an account exists.
  sendSuccess(res, {
    message: FORGOT_PASSWORD_REPLY,
    data: { expiresInMinutes: passwordResetService.OTP_TTL_MINUTES, resendAfterSeconds: passwordResetService.OTP_RESEND_COOLDOWN_SECONDS },
  });
  passwordResetService.requestPasswordReset(req.body.email).catch((err) => {
    console.error('[forgot-password] Failed to issue OTP:', err.message);
  });
});

export const verifyPasswordResetOtp = asyncHandler(async (req, res) => {
  const resetToken = await passwordResetService.verifyOtp(req.body.email, req.body.otp);
  sendSuccess(res, {
    message: 'Code verified. You can now set a new password.',
    data: { resetToken, expiresInMinutes: passwordResetService.RESET_AUTH_TTL_MINUTES },
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await passwordResetService.resetPassword(req.body.resetToken, req.body.newPassword);
  sendSuccess(res, { message: 'Your password has been reset. Please log in with your new password.' });
});
