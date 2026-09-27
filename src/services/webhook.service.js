const prisma = require('../config/database');
const AppError = require('../utils/AppError');

// ─────────────────────────────────────────────────────────────────────────────
// Allowed event types
// ─────────────────────────────────────────────────────────────────────────────
const VALID_EVENT_TYPES = ['payment.success', 'payment.failed'];

const EVENT_TYPE_TO_PAYMENT_STATUS = {
  'payment.success': 'SUCCESS',
  'payment.failed':  'FAILED',
};

const EVENT_TYPE_TO_BOOKING_STATUS = {
  'payment.success': 'CONFIRMED',
  'payment.failed':  'FAILED',
};

// ─────────────────────────────────────────────────────────────────────────────
// processWebhook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process an inbound simulated payment webhook event.
 *
 * Idempotency mechanism
 * ──────────────────────
 * Step 1 — INSERT a PaymentWebhookEvent row with the provider-supplied eventId.
 *           PaymentWebhookEvent.eventId has a @unique DB constraint.
 *           If a duplicate eventId arrives (P2002), the INSERT fails and we
 *           return early — zero side effects on Payment or Booking.
 *
 * Step 2 — Inside a single transaction:
 *           a. Update the matching Payment record (found by transactionId).
 *           b. Update the related Booking status.
 *           c. Mark the PaymentWebhookEvent as PROCESSED.
 *
 * Expected webhook body:
 * {
 *   eventId:       string   — provider-unique event identifier (idempotency key)
 *   eventType:     string   — "payment.success" | "payment.failed"
 *   transactionId: string   — matches Payment.transactionId (set by Step 6)
 *   bookingId:     string   — the booking being paid
 * }
 *
 * @param {object} payload - raw parsed request body
 * @returns {{ alreadyProcessed: boolean, webhookEvent: object, payment?: object, booking?: object }}
 */
const processWebhook = async (payload) => {
  const { eventId, eventType, transactionId, bookingId } = payload;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!eventId || typeof eventId !== 'string' || eventId.trim().length === 0) {
    throw new AppError('eventId is required.', 400);
  }
  if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
    throw new AppError(
      `eventType must be one of: ${VALID_EVENT_TYPES.join(', ')}.`,
      400
    );
  }
  if (!transactionId || typeof transactionId !== 'string' || transactionId.trim().length === 0) {
    throw new AppError('transactionId is required.', 400);
  }
  if (!bookingId || typeof bookingId !== 'string' || bookingId.trim().length === 0) {
    throw new AppError('bookingId is required.', 400);
  }

  const trimmedEventId       = eventId.trim();
  const trimmedTransactionId = transactionId.trim();
  const trimmedBookingId     = bookingId.trim();

  // ── Step 1: Attempt to record the event (idempotency gate) ───────────────
  let webhookEvent;
  try {
    webhookEvent = await prisma.paymentWebhookEvent.create({
      data: {
        eventId:   trimmedEventId,
        eventType,
        bookingId: trimmedBookingId,
        payload,               // store full raw payload for audit
        status:    'RECEIVED',
      },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      // Duplicate delivery — this event has already been processed.
      // Return the existing event record so the caller can respond gracefully.
      const existing = await prisma.paymentWebhookEvent.findUnique({
        where: { eventId: trimmedEventId },
      });
      return { alreadyProcessed: true, webhookEvent: existing };
    }
    throw err;
  }

  // ── Step 2: Resolve Payment and Booking ───────────────────────────────────
  const payment = await prisma.payment.findUnique({
    where: { transactionId: trimmedTransactionId },
  });

  if (!payment) {
    // Mark the event as failed so it can be investigated / replayed
    await prisma.paymentWebhookEvent.update({
      where: { id: webhookEvent.id },
      data:  { status: 'FAILED', errorMessage: `No payment found for transactionId "${trimmedTransactionId}".` },
    });
    throw new AppError(
      `No payment found for transactionId "${trimmedTransactionId}".`,
      404
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id: trimmedBookingId },
  });

  if (!booking) {
    await prisma.paymentWebhookEvent.update({
      where: { id: webhookEvent.id },
      data:  { status: 'FAILED', errorMessage: `Booking "${trimmedBookingId}" not found.` },
    });
    throw new AppError(`Booking "${trimmedBookingId}" not found.`, 404);
  }

  const newPaymentStatus = EVENT_TYPE_TO_PAYMENT_STATUS[eventType];
  const newBookingStatus = EVENT_TYPE_TO_BOOKING_STATUS[eventType];

  // ── Step 3: Atomic update — Payment + Booking + mark event PROCESSED ──────
  const [updatedPayment, updatedBooking, updatedEvent] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data:  { status: newPaymentStatus },
    }),
    prisma.booking.update({
      where: { id: trimmedBookingId },
      data:  { status: newBookingStatus },
    }),
    prisma.paymentWebhookEvent.update({
      where: { id: webhookEvent.id },
      data:  { status: 'PROCESSED', processedAt: new Date() },
    }),
  ]);

  return {
    alreadyProcessed: false,
    webhookEvent: updatedEvent,
    payment: {
      id:            updatedPayment.id,
      status:        updatedPayment.status,
      transactionId: updatedPayment.transactionId,
    },
    booking: {
      id:     updatedBooking.id,
      status: updatedBooking.status,
    },
  };
};

module.exports = { processWebhook };
