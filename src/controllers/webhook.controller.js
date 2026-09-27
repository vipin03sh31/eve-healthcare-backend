const webhookService = require('../services/webhook.service');
const { sendSuccess, sendError } = require('../utils/response');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Receive and process a simulated payment provider webhook event.
 *
 * This endpoint does NOT require JWT authentication — it represents an
 * external provider callback. In a production system you would verify a
 * webhook signature; for this assignment no signature verification is required.
 *
 * Expected body:
 * {
 *   "eventId":       "evt_unique_123",
 *   "eventType":     "payment.success" | "payment.failed",
 *   "transactionId": "sim_success_...",
 *   "bookingId":     "uuid"
 * }
 */
const handleWebhook = async (req, res, next) => {
  try {
    const result = await webhookService.processWebhook(req.body);

    if (result.alreadyProcessed) {
      // Idempotent — duplicate delivery, no side effects applied
      return sendSuccess(
        res,
        { eventId: result.webhookEvent.eventId, status: result.webhookEvent.status },
        'Event already processed. No changes made.'
      );
    }

    return sendSuccess(
      res,
      {
        eventId:     result.webhookEvent.eventId,
        eventStatus: result.webhookEvent.status,
        payment:     result.payment,
        booking:     result.booking,
      },
      'Webhook event processed successfully.'
    );
  } catch (err) {
    next(err);
  }
};

module.exports = { handleWebhook };
