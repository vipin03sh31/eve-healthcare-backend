const testService = require('../services/test.service');
const { validateTest } = require('../utils/validation');
const { sendSuccess, sendCreated, sendError } = require('../utils/response');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new diagnostic test in the global catalogue.
 * Requires: authentication.
 */
const createTest = async (req, res, next) => {
  try {
    const { name, description, turnaround } = req.body;

    const { valid, errors } = validateTest({ name });
    if (!valid) return sendError(res, 'Validation failed.', 400, errors);

    const test = await testService.createTest({ name, description, turnaround });

    return sendCreated(res, test, 'Diagnostic test created successfully.');
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all diagnostic tests in the global catalogue.
 * Public — no authentication required.
 */
const getAllTests = async (req, res, next) => {
  try {
    const tests = await testService.getAllTests();
    return sendSuccess(res, tests, 'Diagnostic tests retrieved successfully.');
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tests/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a single diagnostic test by ID, including where it is available and at what price.
 * Public — no authentication required.
 */
const getTestById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const test = await testService.getTestById(id);
    return sendSuccess(res, test, 'Diagnostic test retrieved successfully.');
  } catch (err) {
    next(err);
  }
};

module.exports = { createTest, getAllTests, getTestById };
