export class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isApiError = true;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  /** `code` (e.g. TOKEN_EXPIRED) lets the app tell "refresh quietly" from "sign in again". */
  static unauthorized(message = 'You are not authenticated.', code = undefined) {
    const err = new ApiError(401, message);
    if (code) err.code = code;
    return err;
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'The requested resource was not found.') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }

  static internal(message = 'Something went wrong. Please try again.') {
    return new ApiError(500, message);
  }
}
