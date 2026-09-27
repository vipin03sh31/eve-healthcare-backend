/**
 * Simulated Payment Processor
 *
 * This module replaces a real payment gateway for the purposes of this
 * assignment. No actual money is moved.
 *
 * Determinism strategy
 * ────────────────────
 * Rather than using Math.random() (which makes testing impossible to reason
 * about), the outcome is derived from the booking amount:
 *
 *   amount ends in .00  →  SUCCESS
 *   any other cents     →  FAILED
 *
 * This gives tests complete control: supply an amount ending in .00 for a
 * success path, anything else for a failure path. Real-world behaviour can be
 * simulated just by adjusting the test fixture.
 *
 * A unique simulated transaction ID is always generated so the Payment record
 * has a non-null transactionId.
 */

const crypto = require('crypto');

/**
 * Simulate a payment attempt.
 *
 * @param {{ bookingId: string, amount: string|number }} opts
 * @returns {{ outcome: 'SUCCESS'|'FAILED', transactionId: string, providerMeta: object }}
 */
const simulatePayment = ({ bookingId, amount }) => {
  // Convert Prisma Decimal (may be a string like "499.00") to a Number
  const amountNum = parseFloat(amount);

  // Deterministic rule: amounts ending in .00 succeed, anything else fails.
  // e.g.  499.00  → SUCCESS
  //        499.50 → FAILED
  const cents = Math.round((amountNum % 1) * 100);
  const outcome = cents === 0 ? 'SUCCESS' : 'FAILED';

  // Generate a unique simulated transaction reference
  const transactionId = `sim_${outcome.toLowerCase()}_${crypto.randomUUID()}`;

  const providerMeta = {
    provider: 'simulated',
    bookingId,
    requestedAmount: amountNum,
    outcome,
    processedAt: new Date().toISOString(),
  };

  return { outcome, transactionId, providerMeta };
};

module.exports = { simulatePayment };
