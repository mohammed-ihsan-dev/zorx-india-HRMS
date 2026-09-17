import { env } from '../config/env.js';

export function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, req, res, next) {
  const isApiError = err.isApiError === true;
  const statusCode = isApiError ? err.statusCode : err.name === 'ValidationError' ? 400 : 500;

  if (!isApiError && env.nodeEnv !== 'test') {
    console.error('[error]', err);
  }

  const message = statusCode === 500 && !isApiError ? 'Something went wrong. Please try again.' : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    ...(isApiError && err.details ? { details: err.details } : {}),
  });
}
