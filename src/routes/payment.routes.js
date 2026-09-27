const { Router } = require('express');
const { initiatePayment } = require('../controllers/payment.controller');
const { handleWebhook }   = require('../controllers/webhook.controller');
const authenticate        = require('../middleware/authenticate');

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — must be registered BEFORE the authenticate middleware.
// Represents an inbound callback from the (simulated) external payment provider.
// No user JWT is available from an external provider.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route  POST /api/payments/webhook
 * @desc   Receive and process a simulated payment provider webhook event
 * @access Public (no JWT — external provider callback)
 */
router.post('/webhook', handleWebhook);

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE — all routes below require a valid JWT.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @route  POST /api/payments
 * @desc   Initiate a simulated payment for a booking
 * @access Private (authenticated)
 *
 * Body: { bookingId: string }
 * Note: "amount" in the body is ignored — amount comes from the Booking record.
 */
router.post('/', authenticate, initiatePayment);

module.exports = router;
