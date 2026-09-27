const jwt = require('jsonwebtoken');
const config = require('../config');
const { sendError } = require('../utils/response');

/**
 * JWT Authentication Middleware.
 *
 * Reads the Authorization header, validates the Bearer token, and attaches
 * the decoded payload to `req.user`.
 *
 * Usage:
 *   router.get('/protected', authenticate, handler);
 *
 * req.user shape after successful authentication:
 *   { sub: string, email: string, role: 'PATIENT'|'ADMIN', iat: number, exp: number }
 */
const authenticate = (req, res, next) => {
  // ── 1. Read the Authorization header ──────────────────────────────────────
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return sendError(res, 'Authorization header is missing.', 401);
  }

  // ── 2. Expect "Bearer <token>" format ─────────────────────────────────────
  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return sendError(
      res,
      'Authorization header must use Bearer scheme: "Bearer <token>".',
      401
    );
  }

  const token = parts[1];

  if (!token) {
    return sendError(res, 'Token is missing.', 401);
  }

  // ── 3. Verify the token ───────────────────────────────────────────────────
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    // Attach the decoded payload to the request for downstream handlers
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 'Token has expired. Please log in again.', 401);
    }
    // JsonWebTokenError, NotBeforeError, etc.
    return sendError(res, 'Invalid token.', 401);
  }
};

module.exports = authenticate;
