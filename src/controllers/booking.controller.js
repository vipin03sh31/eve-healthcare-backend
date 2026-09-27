const bookingService = require('../services/booking.service');
const { validateBooking } = require('../utils/validation');
const { sendSuccess, sendCreated, sendError } = require('../utils/response');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bookings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new booking for the authenticated user.
 *
 * The userId is always taken from req.user (JWT payload) — never from the body.
 * The amount is always snapshotted from the CentreTest record — never from the body.
 */
const createBooking = async (req, res, next) => {
  try {
    const { centreTestId, scheduledAt, notes } = req.body;
    const userId = req.user.sub; // from JWT — cannot be forged

    // Fast field-presence check before hitting the DB
    const { valid, errors } = validateBooking({ centreTestId, scheduledAt });
    if (!valid) return sendError(res, 'Validation failed.', 400, errors);

    const booking = await bookingService.createBooking(userId, {
      centreTestId,
      scheduledAt,
      notes,
    });

    return sendCreated(res, booking, 'Booking created successfully.');
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all bookings for the authenticated user.
 * Only returns bookings that belong to req.user.sub.
 */
const getUserBookings = async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const bookings = await bookingService.getUserBookings(userId);
    return sendSuccess(res, bookings, 'Bookings retrieved successfully.');
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bookings/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a single booking by ID.
 * Returns 403 if the booking belongs to a different user.
 */
const getBookingById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.sub;

    const booking = await bookingService.getBookingById(id, userId);
    return sendSuccess(res, booking, 'Booking retrieved successfully.');
  } catch (err) {
    next(err);
  }
};

module.exports = { createBooking, getUserBookings, getBookingById };
