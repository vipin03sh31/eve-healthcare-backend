const paymentService = require('../services/payment.service');
const { sendCreated, sendError } = require('../utils/response');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initiate a simulated payment for a booking.
 *
 * The userId is always taken from req.user (JWT) — never from the body.
 * The amount is always taken from Booking.amount — never from the body.
 * Any "amount" field supplied in the request body is silently ignored.
 */
const initiatePayment = async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    const userId = req.user.sub; // from JWT — cannot be forged

    if (!bookingId || typeof bookingId !== 'string' || bookingId.trim().length === 0) {
      return sendError(res, 'bookingId is required.', 400);
    }

    const result = await paymentService.processPayment(bookingId.trim(), userId);

    return sendCreated(res, result, `Payment ${result.status} for booking ${bookingId}.`);
  } catch (err) {
    next(err);
  }
};

module.exports = { initiatePayment };
