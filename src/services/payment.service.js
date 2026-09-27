const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { simulatePayment } = require('../utils/paymentSimulator');

// ─────────────────────────────────────────────────────────────────────────────
// Booking states that are already terminal for payment purposes.
// Attempting to pay for a booking in any of these states is rejected.
// ─────────────────────────────────────────────────────────────────────────────
const NON_PAYABLE_STATUSES = ['CONFIRMED', 'FAILED', 'CANCELLED'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a Payment record into a clean response object.
 */
const formatPayment = (payment, booking) => ({
  id:            payment.id,
  bookingId:     payment.bookingId,
  amount:        payment.amount,
  status:        payment.status,
  transactionId: payment.transactionId,
  providerMeta:  payment.providerMeta,
  createdAt:     payment.createdAt,
  booking: {
    id:          booking.id,
    status:      booking.status,
    scheduledAt: booking.scheduledAt,
    amount:      booking.amount,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Service function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a simulated payment for a booking.
 *
 * Business rules enforced:
 *  1. Booking must exist.
 *  2. Booking must belong to the requesting user.
 *  3. Booking must be in PENDING state.
 *  4. Amount is ALWAYS taken from Booking.amount — never from the client.
 *  5. Payment creation + booking status update execute inside a transaction.
 *  6. Payment.bookingId is @unique — Prisma prevents duplicate payment records.
 *
 * @param {string} bookingId - from request body
 * @param {string} requestingUserId - from JWT (req.user.sub)
 * @returns {{ payment: object, booking: object }}
 */
const processPayment = async (bookingId, requestingUserId) => {
  // ── 1. Load the booking ──────────────────────────────────────────────────
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new AppError('Booking not found.', 404);
  }

  // ── 2. Ownership check ───────────────────────────────────────────────────
  if (booking.userId !== requestingUserId) {
    throw new AppError('You are not authorized to pay for this booking.', 403);
  }

  // ── 3. State guard ───────────────────────────────────────────────────────
  if (NON_PAYABLE_STATUSES.includes(booking.status)) {
    throw new AppError(
      `Payment cannot be processed for a booking with status "${booking.status}".`,
      409
    );
  }

  // ── 4. Simulate payment — amount from booking, never from client ─────────
  const { outcome, transactionId, providerMeta } = simulatePayment({
    bookingId: booking.id,
    amount:    booking.amount, // ← always from DB, not from request
  });

  const paymentStatus  = outcome;                          // 'SUCCESS' | 'FAILED'
  const bookingStatus  = outcome === 'SUCCESS' ? 'CONFIRMED' : 'FAILED';

  // ── 5. Persist payment + update booking atomically ───────────────────────
  let payment;
  let updatedBooking;

  try {
    [payment, updatedBooking] = await prisma.$transaction([
      // Create the Payment record
      prisma.payment.create({
        data: {
          bookingId,
          amount:        booking.amount,  // snapshot from booking
          status:        paymentStatus,
          transactionId,
          providerMeta,
        },
      }),
      // Update the Booking status
      prisma.booking.update({
        where: { id: bookingId },
        data:  { status: bookingStatus },
      }),
    ]);
  } catch (err) {
    // P2002: Payment.bookingId unique constraint — duplicate payment attempt
    if (err.code === 'P2002') {
      throw new AppError(
        'A payment record already exists for this booking.',
        409
      );
    }
    throw err;
  }

  return formatPayment(payment, updatedBooking);
};

module.exports = { processPayment };
