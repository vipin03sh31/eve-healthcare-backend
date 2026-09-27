/**
 * Input validation helpers.
 * Pure functions — no side effects, easy to unit test.
 */

/**
 * Validate an email address format.
 * @param {string} email
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};

/**
 * Validate signup payload.
 *
 * Rules:
 *  - name      : required, non-empty string
 *  - email     : required, valid email format
 *  - password  : required, min 8 chars, at least one letter and one digit
 *
 * @param {{ name, email, password }} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateSignup = ({ name, email, password } = {}) => {
  const errors = [];

  // ── name ──────────────────────────────────────────────────────────────────
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Name is required.');
  }

  // ── email ─────────────────────────────────────────────────────────────────
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push('Email is required.');
  } else if (!isValidEmail(email.trim())) {
    errors.push('Email must be a valid email address.');
  }

  // ── password ──────────────────────────────────────────────────────────────
  if (!password || typeof password !== 'string' || password.length === 0) {
    errors.push('Password is required.');
  } else {
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long.');
    }
    if (!/[a-zA-Z]/.test(password)) {
      errors.push('Password must contain at least one letter.');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one digit.');
    }
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Validate login payload.
 *
 * Rules:
 *  - email    : required, valid format
 *  - password : required, non-empty
 *
 * @param {{ email, password }} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateLogin = ({ email, password } = {}) => {
  const errors = [];

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push('Email is required.');
  } else if (!isValidEmail(email.trim())) {
    errors.push('Email must be a valid email address.');
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    errors.push('Password is required.');
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Validate diagnostic centre creation payload.
 *
 * Required: name, address, city, state, pincode
 * Optional: phone, email
 *
 * @param {object} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateCentre = ({ name, address, city, state, pincode, email } = {}) => {
  const errors = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Centre name is required.');
  }
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    errors.push('Address is required.');
  }
  if (!city || typeof city !== 'string' || city.trim().length === 0) {
    errors.push('City is required.');
  }
  if (!state || typeof state !== 'string' || state.trim().length === 0) {
    errors.push('State is required.');
  }
  if (!pincode || typeof pincode !== 'string' || pincode.trim().length === 0) {
    errors.push('Pincode is required.');
  }
  // Optional email — validate format if provided
  if (email && !isValidEmail(email.trim())) {
    errors.push('Email must be a valid email address.');
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Validate diagnostic test creation payload.
 *
 * Required: name
 * Optional: description, turnaround
 *
 * @param {object} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateTest = ({ name } = {}) => {
  const errors = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Test name is required.');
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Validate the payload for adding a test to a centre (CentreTest offering).
 *
 * Required: testId (string UUID), price (positive number)
 *
 * @param {object} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateCentreTest = ({ testId, price } = {}) => {
  const errors = [];

  if (!testId || typeof testId !== 'string' || testId.trim().length === 0) {
    errors.push('testId is required.');
  }

  if (price === undefined || price === null || price === '') {
    errors.push('Price is required.');
  } else {
    const parsed = parseFloat(price);
    if (isNaN(parsed) || parsed < 0) {
      errors.push('Price must be a non-negative number.');
    }
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Validate booking creation payload.
 *
 * Required: centreTestId (non-empty string), scheduledAt (non-empty string)
 * Optional: notes
 *
 * Note: deeper validation (future date, isActive offering) is done in the service
 * because it requires database lookups.
 *
 * @param {object} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateBooking = ({ centreTestId, scheduledAt } = {}) => {
  const errors = [];

  if (!centreTestId || typeof centreTestId !== 'string' || centreTestId.trim().length === 0) {
    errors.push('centreTestId is required.');
  }

  if (!scheduledAt || typeof scheduledAt !== 'string' || scheduledAt.trim().length === 0) {
    errors.push('scheduledAt is required.');
  }

  return { valid: errors.length === 0, errors };
};

module.exports = {
  isValidEmail,
  validateSignup,
  validateLogin,
  validateCentre,
  validateTest,
  validateCentreTest,
  validateBooking,
};
