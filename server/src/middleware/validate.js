import { ApiError } from '../utils/ApiError.js';

export function validateBody(schema) {
  return function bodyValidator(req, res, next) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(ApiError.badRequest('Invalid request data.', result.error.flatten()));
    }
    req.body = result.data;
    return next();
  };
}

export function validateQuery(schema) {
  return function queryValidator(req, res, next) {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(ApiError.badRequest('Invalid query parameters.', result.error.flatten()));
    }
    req.query = result.data;
    return next();
  };
}
