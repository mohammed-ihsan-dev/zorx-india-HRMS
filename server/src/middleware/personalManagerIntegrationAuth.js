import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// Separate, machine-to-machine authentication for the read-only Personal
// Manager integration. It does NOT use user JWTs or cookies, and it never
// accepts an employee id from the request: the token is bound server-side to
// exactly one employee (PERSONAL_MANAGER_EMPLOYEE_ID). Fails closed when the
// integration is not configured.

const MIN_TOKEN_LENGTH = 32;

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

export function personalManagerIntegrationConfig() {
  const token = (env.personalManagerIntegration?.token || '').trim();
  const employeeId = (env.personalManagerIntegration?.employeeId || '').trim();
  const configured = token.length >= MIN_TOKEN_LENGTH && mongoose.isValidObjectId(employeeId);
  return { configured, token, employeeId };
}

export function requirePersonalManagerToken(req, res, next) {
  const { configured, token, employeeId } = personalManagerIntegrationConfig();
  if (!configured) {
    return next(new ApiError(503, 'The Personal Manager integration is not configured on this server.'));
  }
  const header = req.headers.authorization || '';
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  // Constant-time comparison of fixed-length digests (no length leak).
  if (!presented || !crypto.timingSafeEqual(digest(presented), digest(token))) {
    return next(ApiError.unauthorized('Invalid integration credentials.'));
  }
  req.integrationEmployeeId = new mongoose.Types.ObjectId(employeeId);
  return next();
}
