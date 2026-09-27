'use strict';

/**
 * Payment Webhook — integration tests.
 *
 * Prisma is fully mocked — no PostgreSQL needed.
 *
 * Coverage:
 *  Basic processing   – SUCCESS event, FAILED event
 *  State changes      – payment updated, booking updated
 *  Idempotency        – duplicate eventId → no side effects, 200 returned
 *  Validation         – missing eventId, missing eventType, invalid eventType,
 *                       missing transactionId, missing bookingId
 *  Not found          – nonexistent transactionId, nonexistent bookingId
 *  No JWT required    – webhook endpoint is public
 *  Regression guard   – POST /api/payments still requires JWT
 */

process.env.NODE_ENV       = 'test';
process.env.JWT_SECRET     = 'test_jwt_secret_do_not_use_in_production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS  = '1';

const request = require('supertest');
const jwt     = require('jsonwebtoken');

// ─── Mock Prisma BEFORE requiring the app ─────────────────────────────────
jest.mock('../config/database', () => ({
  user:             { findUnique: jest.fn(), create: jest.fn() },
  diagnosticCentre: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  diagnosticTest:   { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  centreTest:       { create: jest.fn(), findUnique: jest.fn() },
  booking:          { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  payment:          { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  paymentWebhookEvent: {
    create:     jest.fn(),
    findUnique: jest.fn(),
    update:     jest.fn(),
  },
  $transaction:  jest.fn(),
  $queryRaw:     jest.fn().mockResolvedValue([]),
  $disconnect:   jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../config/database');
const app    = require('../app');

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const BOOKING_ID     = 'booking-uuid';
const PAYMENT_ID     = 'payment-uuid';
const TX_ID          = 'sim_success_tx-uuid';
const EVENT_ID       = 'evt_unique_001';
const WEBHOOK_EVT_ID = 'wh-evt-uuid';

const makeToken = () =>
  jwt.sign({ sub: 'user-uuid', email: 'a@b.com', role: 'PATIENT' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const validSuccessPayload = () => ({
  eventId:       EVENT_ID,
  eventType:     'payment.success',
  transactionId: TX_ID,
  bookingId:     BOOKING_ID,
});

const validFailedPayload = () => ({
  eventId:       'evt_failed_001',
  eventType:     'payment.failed',
  transactionId: 'sim_failed_tx-uuid',
  bookingId:     BOOKING_ID,
});

const fakeWebhookEvent = (overrides = {}) => ({
  id:          WEBHOOK_EVT_ID,
  eventId:     EVENT_ID,
  eventType:   'payment.success',
  bookingId:   BOOKING_ID,
  payload:     validSuccessPayload(),
  status:      'RECEIVED',
  errorMessage: null,
  processedAt: null,
  createdAt:   new Date(),
  ...overrides,
});

const fakePayment = (status = 'SUCCESS') => ({
  id:            PAYMENT_ID,
  bookingId:     BOOKING_ID,
  amount:        '500.00',
  status,
  transactionId: TX_ID,
  providerMeta:  {},
  createdAt:     new Date(),
  updatedAt:     new Date(),
});

const fakeBooking = (status = 'PENDING') => ({
  id:          BOOKING_ID,
  userId:      'user-uuid',
  status,
  amount:      '500.00',
  scheduledAt: new Date(),
  createdAt:   new Date(),
  updatedAt:   new Date(),
});

// Helper: set up all mocks for a clean new event processing
const mockNewEventSuccess = () => {
  prisma.paymentWebhookEvent.create.mockResolvedValue(fakeWebhookEvent({ status: 'RECEIVED' }));
  prisma.payment.findUnique.mockResolvedValue(fakePayment('SUCCESS'));
  prisma.booking.findUnique.mockResolvedValue(fakeBooking('PENDING'));
  prisma.$transaction.mockResolvedValue([
    { ...fakePayment('SUCCESS'), status: 'SUCCESS' },
    { ...fakeBooking('CONFIRMED'), status: 'CONFIRMED' },
    { ...fakeWebhookEvent({ status: 'PROCESSED', processedAt: new Date() }) },
  ]);
};

const mockNewEventFailed = () => {
  prisma.paymentWebhookEvent.create.mockResolvedValue(
    fakeWebhookEvent({ eventId: 'evt_failed_001', eventType: 'payment.failed', status: 'RECEIVED' })
  );
  prisma.payment.findUnique.mockResolvedValue(fakePayment('FAILED'));
  prisma.booking.findUnique.mockResolvedValue(fakeBooking('PENDING'));
  prisma.$transaction.mockResolvedValue([
    { ...fakePayment('FAILED'), status: 'FAILED' },
    { ...fakeBooking('FAILED'), status: 'FAILED' },
    { ...fakeWebhookEvent({ status: 'PROCESSED' }) },
  ]);
};

afterEach(() => jest.clearAllMocks());
afterAll(async () => { await prisma.$disconnect(); });

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/payments/webhook — Basic processing
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/payments/webhook — SUCCESS event', () => {

  it('should return 200 and process a valid SUCCESS event', async () => {
    mockNewEventSuccess();

    const res = await request(app)
      .post('/api/payments/webhook')
      .send(validSuccessPayload());

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/processed successfully/i);
  });

  it('should update payment to SUCCESS', async () => {
    mockNewEventSuccess();

    const res = await request(app)
      .post('/api/payments/webhook')
      .send(validSuccessPayload());

    expect(res.body.data.payment.status).toBe('SUCCESS');
  });

  it('should update booking to CONFIRMED on SUCCESS', async () => {
    mockNewEventSuccess();

    const res = await request(app)
      .post('/api/payments/webhook')
      .send(validSuccessPayload());

    expect(res.body.data.booking.status).toBe('CONFIRMED');
  });

  it('should include the eventId in the response', async () => {
    mockNewEventSuccess();

    const res = await request(app)
      .post('/api/payments/webhook')
      .send(validSuccessPayload());

    expect(res.body.data.eventId).toBe(EVENT_ID);
  });

  it('should use a single $transaction for atomic writes', async () => {
    mockNewEventSuccess();

    await request(app)
      .post('/api/payments/webhook')
      .send(validSuccessPayload());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/payments/webhook — FAILED event', () => {

  it('should return 200 and process a valid FAILED event', async () => {
    mockNewEventFailed();

    const res = await request(app)
      .post('/api/payments/webhook')
      .send(validFailedPayload());

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should update payment to FAILED and booking to FAILED', async () => {
    mockNewEventFailed();

    const res = await request(app)
      .post('/api/payments/webhook')
      .send(validFailedPayload());

    expect(res.body.data.payment.status).toBe('FAILED');
    expect(res.body.data.booking.status).toBe('FAILED');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/payments/webhook — Idempotency
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/payments/webhook — idempotency', () => {

  it('should return 200 without side effects when the same event is sent twice', async () => {
    // Second delivery: paymentWebhookEvent.create throws P2002 (eventId already exists)
    const duplicateErr = new Error('Unique constraint failed on event_id');
    duplicateErr.code = 'P2002';
    prisma.paymentWebhookEvent.create.mockRejectedValue(duplicateErr);

    // Return the existing event record
    prisma.paymentWebhookEvent.findUnique.mockResolvedValue(
      fakeWebhookEvent({ status: 'PROCESSED' })
    );

    const res = await request(app)
      .post('/api/payments/webhook')
      .send(validSuccessPayload());

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/already processed/i);
  });

  it('should NOT call $transaction on a duplicate event (no side effects)', async () => {
    const duplicateErr = new Error('Unique constraint');
    duplicateErr.code = 'P2002';
    prisma.paymentWebhookEvent.create.mockRejectedValue(duplicateErr);
    prisma.paymentWebhookEvent.findUnique.mockResolvedValue(
      fakeWebhookEvent({ status: 'PROCESSED' })
    );

    await request(app)
      .post('/api/payments/webhook')
      .send(validSuccessPayload());

    // No Payment or Booking updates must occur
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it('should NOT create another PaymentWebhookEvent row on duplicate delivery', async () => {
    const duplicateErr = new Error('Unique constraint');
    duplicateErr.code = 'P2002';
    prisma.paymentWebhookEvent.create.mockRejectedValue(duplicateErr);
    prisma.paymentWebhookEvent.findUnique.mockResolvedValue(
      fakeWebhookEvent({ status: 'PROCESSED' })
    );

    await request(app)
      .post('/api/payments/webhook')
      .send(validSuccessPayload());

    // create was called once (and failed with P2002); it must not be called again
    expect(prisma.paymentWebhookEvent.create).toHaveBeenCalledTimes(1);
  });

  it('should return the existing event status on duplicate delivery', async () => {
    const duplicateErr = new Error('Unique constraint');
    duplicateErr.code = 'P2002';
    prisma.paymentWebhookEvent.create.mockRejectedValue(duplicateErr);
    prisma.paymentWebhookEvent.findUnique.mockResolvedValue(
      fakeWebhookEvent({ status: 'PROCESSED' })
    );

    const res = await request(app)
      .post('/api/payments/webhook')
      .send(validSuccessPayload());

    expect(res.body.data.status).toBe('PROCESSED');
    expect(res.body.data.eventId).toBe(EVENT_ID);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/payments/webhook — Validation
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/payments/webhook — validation', () => {

  it('should return 400 when eventId is missing', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ eventType: 'payment.success', transactionId: TX_ID, bookingId: BOOKING_ID });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/eventId/i);
  });

  it('should return 400 when eventType is missing', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ eventId: EVENT_ID, transactionId: TX_ID, bookingId: BOOKING_ID });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/eventType/i);
  });

  it('should return 400 when eventType is invalid', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ eventId: EVENT_ID, eventType: 'payment.refunded', transactionId: TX_ID, bookingId: BOOKING_ID });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/eventType/i);
  });

  it('should return 400 when transactionId is missing', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ eventId: EVENT_ID, eventType: 'payment.success', bookingId: BOOKING_ID });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/transactionId/i);
  });

  it('should return 400 when bookingId is missing', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ eventId: EVENT_ID, eventType: 'payment.success', transactionId: TX_ID });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/bookingId/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/payments/webhook — Not found
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/payments/webhook — not found', () => {

  it('should return 404 when no payment exists for the given transactionId', async () => {
    prisma.paymentWebhookEvent.create.mockResolvedValue(fakeWebhookEvent());
    prisma.payment.findUnique.mockResolvedValue(null); // no matching payment
    prisma.paymentWebhookEvent.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/payments/webhook')
      .send(validSuccessPayload());

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/no payment found/i);
  });

  it('should return 404 when the booking does not exist', async () => {
    prisma.paymentWebhookEvent.create.mockResolvedValue(fakeWebhookEvent());
    prisma.payment.findUnique.mockResolvedValue(fakePayment());
    prisma.booking.findUnique.mockResolvedValue(null); // booking missing
    prisma.paymentWebhookEvent.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/payments/webhook')
      .send(validSuccessPayload());

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/payments/webhook — No JWT required
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/payments/webhook — no JWT required', () => {

  it('should accept the webhook WITHOUT an Authorization header', async () => {
    mockNewEventSuccess();

    const res = await request(app)
      .post('/api/payments/webhook')
      // Deliberately no Authorization header
      .send(validSuccessPayload());

    // Must NOT return 401
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/payments (initiate) still requires a JWT', async () => {
    const res = await request(app)
      .post('/api/payments')
      .send({ bookingId: BOOKING_ID });

    expect(res.statusCode).toBe(401);
  });
});
