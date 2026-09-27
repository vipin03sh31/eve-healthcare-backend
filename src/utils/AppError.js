/**
 * Custom application error class.
 * Throw this inside services/controllers to trigger the global error handler.
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {*} [errors] - Optional validation errors or additional context
   */
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
    // Capture stack trace (V8 only)
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
