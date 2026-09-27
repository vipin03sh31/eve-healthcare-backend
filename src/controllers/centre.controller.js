const centreService = require('../services/centre.service');
const { validateCentre, validateCentreTest } = require('../utils/validation');
const { sendSuccess, sendCreated, sendError } = require('../utils/response');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/centres
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new diagnostic centre.
 * Requires: authentication (any role — in a real system only ADMIN would create centres)
 */
const createCentre = async (req, res, next) => {
  try {
    const { name, address, city, state, pincode, phone, email } = req.body;

    const { valid, errors } = validateCentre({ name, address, city, state, pincode, email });
    if (!valid) return sendError(res, 'Validation failed.', 400, errors);

    const centre = await centreService.createCentre({
      name, address, city, state, pincode, phone, email,
    });

    return sendCreated(res, centre, 'Diagnostic centre created successfully.');
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/centres
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all diagnostic centres with their active test offerings.
 * Public — no authentication required.
 */
const getAllCentres = async (req, res, next) => {
  try {
    const centres = await centreService.getAllCentres();
    return sendSuccess(res, centres, 'Diagnostic centres retrieved successfully.');
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/centres/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a single diagnostic centre by ID.
 * Public — no authentication required.
 */
const getCentreById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const centre = await centreService.getCentreById(id);
    return sendSuccess(res, centre, 'Diagnostic centre retrieved successfully.');
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/centres/:id/tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a diagnostic test to a centre's offerings with a centre-specific price.
 * Requires: authentication.
 */
const addTestToCentre = async (req, res, next) => {
  try {
    const { id: centreId } = req.params;
    const { testId, price } = req.body;

    const { valid, errors } = validateCentreTest({ testId, price });
    if (!valid) return sendError(res, 'Validation failed.', 400, errors);

    const centreTest = await centreService.addTestToCentre(centreId, { testId, price });

    return sendCreated(res, centreTest, 'Test added to centre successfully.');
  } catch (err) {
    next(err);
  }
};

module.exports = { createCentre, getAllCentres, getCentreById, addTestToCentre };
