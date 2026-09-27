'use strict';

/**
 * Booking System — integration tests.
 *
 * Prisma is fully mocked — no PostgreSQL needed.
 *
 * Coverage:
 *  Create booking  – success, price snapshot, status=PENDING, validation,
 *                    inactive offering, past date, missing fields, unauthenticated
 *  Get booking     – own booking, another user's booking (403), not found (404),
 *                    unauthenticated
 *  List bookings   – own bookings only, empty list, unauthenticated
 *  Auth checks     – all routes require a valid JWT
 */

process.env.NODE_ENV      = 'test';
process.env.JWT_SECRET    = 'test_jwt_secret_do_not_use_in_production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS = '1';

const request = require('supertest');
const jwt     = require('jsonwebtoken');

// ─── Mock Prisma BEFORE requiring the app ─────────────────────────────────
jest.mock('../config/database', () => ({
  user:         { findUnique: jest.fn(), create: jest.fn() },
  diagnosticCentre: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  diagnosticTest:   { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  centreTest:   { create: jest.fn(), findUnique: jest.fn() },
  booking:      { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  $queryRaw:    jest.fn().mockResolvedValue([]),
  $disconnect:  jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../config/database');
const app    = require('../app');

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const USER_A_ID = 'user-a-uuid';
const USER_B_ID = 'user-b-uuid';
const CT_ID     = 'centre-test-uuid';
const CENTRE_ID = 'centre-uuid';
const TEST_ID   = 'test-uuid';
const BOOKING_ID = 'booking-uuid';

/** Issue a valid token for the given user id and role. */
const makeToken = (userId = USER_A_ID, role = 'PATIENT') =>
  jwt.sign({ sub: userId, email: 'user@test.com', role }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

/** A future date guaranteed to pass the "must be in the future" check. */
const futureDate = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // +7 days

/** A past date that should fail validation. */
const pastDate = () => new Date(Date.now() - 1000).toISOString();

const fakeCentreTest = (overrides = {}) => ({
  id:       CT_ID,
  centreId: CENTRE_ID,
  testId:   TEST_ID,
  price:    '499.00',
  isActive: true,
  centre:   { id: CENTRE_ID },
  ...overrides,
});

const fakeBooking = (overrides = {}) => ({
  id:          BOOKING_ID,
  userId:      USER_A_ID,
  centreId:    CENTRE_ID,
  centreTestId: CT_ID,
  scheduledAt: new Date(futureDate()),
  status:      'PENDING',
  amount:      '499.00',
  notes:       null,
  createdAt:   new Date(),
  updatedAt:   new Date(),
  user:        { id: USER_A_ID, name: 'User A', email: 'a@test.com' },
  centre:      { id: CENTRE_ID, name: 'City Lab', city: 'Mumbai', state: 'MH', address: '1 St' },
  centreTest:  {
    id:    CT_ID,
    price: '499.00',
    test:  { id: TEST_ID, name: 'CBC', description: null, turnaround: '24h' },
  },
  ...overrides,
});

afterEach(() => jest.clearAllMocks());
afterAll(async () => { await prisma.$disconnect(); });

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/bookings — CREATE BOOKING
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/bookings', () => {

  it('should create a booking and return 201 with PENDING status', async () => {
    prisma.centreTest.findUnique.mockResolvedValue(fakeCentreTest());
    prisma.booking.create.mockResolvedValue(fakeBooking());

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ centreTestId: CT_ID, scheduledAt: futureDate() });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data).toHaveProperty('id');
  });

  it('should snapshot the price from CentreTest — not from the request body', async () => {
    prisma.centreTest.findUnique.mockResolvedValue(fakeCentreTest());
    prisma.booking.create.mockResolvedValue(fakeBooking());

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${makeToken()}`)
      // Client attempts to supply a different amount — should be ignored
      .send({ centreTestId: CT_ID, scheduledAt: futureDate(), amount: 1 });

    expect(res.statusCode).toBe(201);
    // Amount must match the CentreTest price (499.00), not the client-supplied 1
    expect(Number(res.body.data.amount)).toBe(499);
    // Also verify the booking was created with the correct price via Prisma
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: '499.00', // from CentreTest, not from body
        }),
      })
    );
  });

  it('should associate the booking with the authenticated user (from JWT)', async () => {
    prisma.centreTest.findUnique.mockResolvedValue(fakeCentreTest());
    prisma.booking.create.mockResolvedValue(fakeBooking());

    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`)
      .send({ centreTestId: CT_ID, scheduledAt: futureDate() });

    // userId must come from the JWT sub — not from the request body
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: USER_A_ID }),
      })
    );
  });

  it('should include correct centre and test info in the response', async () => {
    prisma.centreTest.findUnique.mockResolvedValue(fakeCentreTest());
    prisma.booking.create.mockResolvedValue(fakeBooking());

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ centreTestId: CT_ID, scheduledAt: futureDate() });

    expect(res.body.data.centre.id).toBe(CENTRE_ID);
    expect(res.body.data.test.centreTestId).toBe(CT_ID);
    expect(res.body.data.test.testId).toBe(TEST_ID);
    expect(res.body.data.test.name).toBe('CBC');
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  it('should return 400 when centreTestId is missing', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ scheduledAt: futureDate() });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('centreTestId')])
    );
  });

  it('should return 400 when scheduledAt is missing', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ centreTestId: CT_ID });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('scheduledAt')])
    );
  });

  it('should return 400 when scheduledAt is not a valid date', async () => {
    prisma.centreTest.findUnique.mockResolvedValue(fakeCentreTest());

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ centreTestId: CT_ID, scheduledAt: 'not-a-date' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/valid.*date/i);
  });

  it('should return 400 when scheduledAt is in the past', async () => {
    prisma.centreTest.findUnique.mockResolvedValue(fakeCentreTest());

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ centreTestId: CT_ID, scheduledAt: pastDate() });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/future/i);
  });

  it('should return 404 when the CentreTest offering does not exist', async () => {
    prisma.centreTest.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ centreTestId: 'nonexistent-ct-id', scheduledAt: futureDate() });

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/does not exist/i);
  });

  it('should return 422 when the CentreTest offering is inactive', async () => {
    prisma.centreTest.findUnique.mockResolvedValue(fakeCentreTest({ isActive: false }));

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ centreTestId: CT_ID, scheduledAt: futureDate() });

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toMatch(/not currently available/i);
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  it('should return 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ centreTestId: CT_ID, scheduledAt: futureDate() });

    expect(res.statusCode).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/bookings/:id — GET SINGLE BOOKING
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/bookings/:id', () => {

  it('should return the booking when it belongs to the authenticated user', async () => {
    prisma.booking.findUnique.mockResolvedValue(fakeBooking());

    const res = await request(app)
      .get(`/api/bookings/${BOOKING_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe(BOOKING_ID);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('should return 403 when a user tries to retrieve another user\'s booking', async () => {
    // Booking belongs to USER_A but request is from USER_B
    prisma.booking.findUnique.mockResolvedValue(fakeBooking({ userId: USER_A_ID }));

    const res = await request(app)
      .get(`/api/bookings/${BOOKING_ID}`)
      .set('Authorization', `Bearer ${makeToken(USER_B_ID)}`); // different user

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not authorized/i);
  });

  it('should return 404 when the booking does not exist', async () => {
    prisma.booking.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/bookings/nonexistent-booking-id`)
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it('should return 401 when unauthenticated', async () => {
    const res = await request(app).get(`/api/bookings/${BOOKING_ID}`);
    expect(res.statusCode).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/bookings — LIST USER BOOKINGS
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/bookings', () => {

  it('should return only the authenticated user\'s bookings', async () => {
    prisma.booking.findMany.mockResolvedValue([fakeBooking(), fakeBooking({ id: 'b2' })]);

    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);

    // Verify the DB was queried with the correct userId filter
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_A_ID },
      })
    );
  });

  it('should return an empty array when the user has no bookings', async () => {
    prisma.booking.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${makeToken(USER_A_ID)}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('should NOT return bookings belonging to other users', async () => {
    // USER_B calls /api/bookings — service is called with USER_B's id
    prisma.booking.findMany.mockResolvedValue([]); // USER_B has no bookings

    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${makeToken(USER_B_ID)}`);

    expect(res.statusCode).toBe(200);
    // DB query must filter by USER_B's id only
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_B_ID },
      })
    );
  });

  it('should return 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/bookings');
    expect(res.statusCode).toBe(401);
  });
});
