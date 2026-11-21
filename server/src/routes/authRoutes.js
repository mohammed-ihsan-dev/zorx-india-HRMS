import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  loginSchema,
  changePasswordSchema,
  signupSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} from '../validators/authValidators.js';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { isAllowedOrigin } from '../utils/origins.js';

const router = Router();

/**
 * CSRF guard for the endpoints that act on the refresh cookie. The cookie is
 * SameSite=Strict (never sent on requests started by another site), and these
 * requests must also carry the app's custom header (which a plain cross-site
 * form or image cannot send, and which forces a CORS preflight) and, when the
 * browser states an Origin, come from the app's own origin.
 */
function requireAppRequest(req, res, next) {
  const origin = req.get('Origin');
  // An Authorization header (older app versions' logout) is equally impossible for a cross-site form.
  const appHeader = req.get('X-ZORX-CSRF') === '1' || Boolean(req.get('Authorization'));
  if (!appHeader || (origin && !isAllowedOrigin(origin))) {
    return next(ApiError.forbidden('This request is not allowed.'));
  }
  return next();
}

const isProduction = env.nodeEnv === 'production';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 20 : 1000,
  skip: () => !isProduction,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isProduction ? 10 : 1000,
  skip: () => !isProduction,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many signup attempts. Please try again later.' },
});

router.post('/signup', signupLimiter, validateBody(signupSchema), authController.signup);
router.post('/login', loginLimiter, validateBody(loginSchema), authController.login);
// Cookie-authenticated endpoints: same-site + custom-header CSRF guard.
router.post('/refresh', requireAppRequest, authController.refresh);
// Not under loginLimiter (shared per IP — the whole office is one IP, and every
// phone upgrades once right after the deploy). It needs a valid signed token, so it
// cannot be used to guess passwords; the per-user /api limit still applies.
router.post('/session/upgrade', requireAppRequest, authController.upgradeSession);
router.post('/logout', requireAppRequest, authController.logout);
router.post('/logout-all', requireAuth, authController.logoutAll);
router.get('/me', requireAuth, authController.getMe);
router.post('/change-password', requireAuth, validateBody(changePasswordSchema), authController.changePassword);

// Public (no session) — rate-limited like login.
router.post('/forgot-password', loginLimiter, validateBody(forgotPasswordSchema), authController.forgotPassword);
router.post('/forgot-password/verify-otp', loginLimiter, validateBody(verifyOtpSchema), authController.verifyPasswordResetOtp);
router.post('/reset-password', loginLimiter, validateBody(resetPasswordSchema), authController.resetPassword);

export default router;
