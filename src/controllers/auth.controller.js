const authService = require('../services/auth.service');
const { validateSignup, validateLogin } = require('../utils/validation');
const { sendCreated, sendSuccess, sendError } = require('../utils/response');
const AppError = require('../utils/AppError');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/signup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a new patient account.
 */
const signup = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    // Validate input
    const { valid, errors } = validateSignup({ name, email, password });
    if (!valid) {
      return sendError(res, 'Validation failed.', 400, errors);
    }

    const result = await authService.signup({ name, email, password, phone });

    return sendCreated(res, result, 'Account created successfully.');
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authenticate a user and return a JWT.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    const { valid, errors } = validateLogin({ email, password });
    if (!valid) {
      return sendError(res, 'Validation failed.', 400, errors);
    }

    const result = await authService.login({ email, password });

    return sendSuccess(res, result, 'Login successful.');
  } catch (err) {
    next(err);
  }
};

module.exports = { signup, login };
