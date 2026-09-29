import { ApiError } from '../utils/ApiError.js';
import { hasPermission } from '../utils/permissions.js';

export function requireRole(...allowedRoles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden());
    }
    return next();
  };
}

/** Authorizes by effective permission (role defaults + explicit grants) rather than role name. */
export function requirePermission(permission) {
  return function permissionGuard(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!hasPermission(req.user, permission)) {
      return next(ApiError.forbidden());
    }
    return next();
  };
}
