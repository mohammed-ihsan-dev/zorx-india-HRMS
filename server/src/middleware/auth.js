import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { User } from '../models/User.js';
import { USER_STATUS } from '../utils/constants.js';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
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

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    throw ApiError.unauthorized('You must be logged in to access this resource.');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Your session has expired. Please log in again.');
    }
    throw ApiError.unauthorized('Your session is invalid. Please log in again.');
  }

  const user = await User.findById(payload.sub).populate('employeeId');
  if (!user) {
    throw ApiError.unauthorized('Your session is invalid. Please log in again.');
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('Your account is not active. Please contact HR/Admin.');
  }

  req.user = user;
  next();
});
