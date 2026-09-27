const { sendError } = require('../utils/response');

/**
 * Global error-handling middleware.
 * Must be registered LAST in the Express middleware chain (after all routes).
 *
 * Handles:
 *  - AppError (known, operational errors thrown by the app)
 *  - Prisma errors (P-code errors from the ORM)
 *  - Generic / unexpected errors
 */
const errorHandler = (err, req, res, next) => {
  // Log the error in non-test environments
  if (process.env.NODE_ENV !== 'test') {
    console.error('[ErrorHandler]', err);
  }

  // ── Known operational error ──────────────────────────────────────────────
  if (err.name === 'AppError') {
    return sendError(res, err.message, err.statusCode, err.errors);
  }

  // ── Prisma unique constraint violation ───────────────────────────────────
  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] || 'field';
    return sendError(res, `A record with this ${field} already exists.`, 409);
  }

  // ── Prisma record not found ───────────────────────────────────────────────
  if (err.code === 'P2025') {
    return sendError(res, 'Record not found.', 404);
  }

  // ── JWT errors ────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 'Invalid token.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 'Token has expired.', 401);
  }

  // ── Unexpected / unhandled error ─────────────────────────────────────────
  const statusCode = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Please try again later.'
      : err.message || 'Internal Server Error';

  return sendError(res, message, statusCode);
};

module.exports = errorHandler;
