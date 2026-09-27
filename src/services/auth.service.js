const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const config = require('../config');
const AppError = require('../utils/AppError');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip sensitive fields from a User record before returning to the client.
 * @param {object} user - Raw Prisma User object
 * @returns {object}
 */
const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  createdAt: user.createdAt,
});

/**
 * Generate a signed JWT for the given user.
 * @param {object} user
 * @returns {string} signed JWT
 */
const generateToken = (user) =>
  jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

// ─────────────────────────────────────────────────────────────────────────────
// Service functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a new patient account.
 *
 * @param {{ name: string, email: string, password: string, phone?: string }} dto
 * @returns {{ user: object, token: string }}
 * @throws {AppError} 409 if email is already registered
 */
const signup = async ({ name, email, password, phone }) => {
  // Normalise email
  const normalizedEmail = email.trim().toLowerCase();

  // Check for duplicate email
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    throw new AppError('An account with this email already exists.', 409);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, config.bcrypt.rounds);

  // Persist new user
  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      phone: phone ? phone.trim() : null,
      role: 'PATIENT',
    },
  });

  const token = generateToken(user);

  return { user: sanitizeUser(user), token };
};

/**
 * Authenticate a user with email + password.
 *
 * @param {{ email: string, password: string }} dto
 * @returns {{ user: object, token: string }}
 * @throws {AppError} 401 for any credential mismatch (intentionally vague)
 */
const login = async ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();

  // Lookup user — use a generic error to avoid email enumeration
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new AppError('Invalid email or password.', 401);
  }

  // Verify password against the stored hash
  const passwordMatch = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatch) {
    throw new AppError('Invalid email or password.', 401);
  }

  const token = generateToken(user);

  return { user: sanitizeUser(user), token };
};

module.exports = { signup, login };
