import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, changePasswordSchema, signupSchema } from '../validators/authValidators.js';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const router = Router();

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
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.getMe);
router.post('/change-password', requireAuth, validateBody(changePasswordSchema), authController.changePassword);

export default router;
