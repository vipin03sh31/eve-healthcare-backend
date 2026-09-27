'use strict';

/**
 * Diagnostic Centres & Tests — integration tests.
 *
 * Prisma is fully mocked — no PostgreSQL needed.
 *
 * Coverage:
 *  Centres  – create, list, get-by-id, invalid ID, validation errors
 *  Tests    – create, list, get-by-id, invalid ID, validation errors
 *  CentreTest – add test to centre, correct price, invalid centre, invalid test
 *  Auth     – unauthenticated access to protected POST routes
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_do_not_use_in_production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS = '1';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// ─── Mock Prisma BEFORE requiring the app ─────────────────────────────────
jest.mock('../config/database', () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
  diagnosticCentre: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  diagnosticTest: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  centreTest: { create: jest.fn() },
  $queryRaw: jest.fn().mockResolvedValue([]),
  $disconnect: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../config/database');
const app = require('../app');

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a valid auth token for tests that require authentication. */
const makeToken = (role = 'PATIENT') =>
  jwt.sign({ sub: 'uid-test', email: 'a@b.com', role }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const CENTRE_ID = 'centre-uuid-1';
const TEST_ID   = 'test-uuid-1';
const CT_ID     = 'ct-uuid-1';

const fakeCentre = (overrides = {}) => ({
  id: CENTRE_ID,
  name: 'City Diagnostics',
  address: '12 Health St',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001',
  phone: null,
  email: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  centreTests: [],
  ...overrides,
});

const fakeTest = (overrides = {}) => ({
  id: TEST_ID,
  name: 'Complete Blood Count',
  description: 'Full blood panel',
  turnaround: '24 hours',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const fakeCentreTest = () => ({
  id: CT_ID,
  centreId: CENTRE_ID,
  testId: TEST_ID,
  price: '299.00',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  centre: { id: CENTRE_ID, name: 'City Diagnostics' },
  test: {
    id: TEST_ID,
    name: 'Complete Blood Count',
    description: 'Full blood panel',
    turnaround: '24 hours',
  },
});

afterEach(() => jest.clearAllMocks());
afterAll(async () => { await prisma.$disconnect(); });

// ═════════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC CENTRES
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/centres', () => {
  const VALID_CENTRE = {
    name: 'City Diagnostics',
    address: '12 Health St',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
  };

  it('should create a centre and return 201', async () => {
    prisma.diagnosticCentre.create.mockResolvedValue(fakeCentre());

    const res = await request(app)
      .post('/api/centres')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(VALID_CENTRE);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('City Diagnostics');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('tests');
  });

  it('should return 401 when not authenticated', async () => {
    const res = await request(app).post('/api/centres').send(VALID_CENTRE);
    expect(res.statusCode).toBe(401);
  });

  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/centres')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ address: '1 St', city: 'Mumbai', state: 'MH', pincode: '400001' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('name')])
    );
  });

  it('should return 400 when required location fields are missing', async () => {
    const res = await request(app)
      .post('/api/centres')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'X' }); // address, city, state, pincode all missing

    expect(res.statusCode).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('should return 400 when email format is invalid', async () => {
    const res = await request(app)
      .post('/api/centres')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...VALID_CENTRE, email: 'not-an-email' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('valid email')])
    );
  });
});

describe('GET /api/centres', () => {
  it('should return all centres (public, no auth)', async () => {
    prisma.diagnosticCentre.findMany.mockResolvedValue([fakeCentre(), fakeCentre({ id: 'c2', name: 'Lab B' })]);

    const res = await request(app).get('/api/centres');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  it('should return an empty array when no centres exist', async () => {
    prisma.diagnosticCentre.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/centres');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/centres/:id', () => {
  it('should return a single centre by ID (public)', async () => {
    prisma.diagnosticCentre.findUnique.mockResolvedValue(fakeCentre());

    const res = await request(app).get(`/api/centres/${CENTRE_ID}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe(CENTRE_ID);
    expect(res.body.data.name).toBe('City Diagnostics');
  });

  it('should return 404 for an invalid/nonexistent centre ID', async () => {
    prisma.diagnosticCentre.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/centres/nonexistent-id');

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/tests', () => {
  it('should create a diagnostic test and return 201', async () => {
    prisma.diagnosticTest.create.mockResolvedValue(fakeTest());

    const res = await request(app)
      .post('/api/tests')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Complete Blood Count', description: 'Full blood panel', turnaround: '24 hours' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Complete Blood Count');
    expect(res.body.data).toHaveProperty('id');
  });

  it('should return 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/tests')
      .send({ name: 'CBC' });

    expect(res.statusCode).toBe(401);
  });

  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/tests')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ description: 'Some test' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Test name')])
    );
  });

  it('should return 400 when name is empty string', async () => {
    const res = await request(app)
      .post('/api/tests')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: '   ' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Test name')])
    );
  });
});

describe('GET /api/tests', () => {
  it('should return all tests (public, no auth)', async () => {
    prisma.diagnosticTest.findMany.mockResolvedValue([fakeTest(), fakeTest({ id: 't2', name: 'Thyroid Panel' })]);

    const res = await request(app).get('/api/tests');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  it('should return empty array when no tests exist', async () => {
    prisma.diagnosticTest.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/tests');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/tests/:id', () => {
  it('should return a single test by ID with availability info (public)', async () => {
    const testWithCentres = {
      ...fakeTest(),
      centreTests: [
        {
          id: CT_ID,
          price: '299.00',
          isActive: true,
          centre: { id: CENTRE_ID, name: 'City Diagnostics', city: 'Mumbai' },
        },
      ],
    };
    prisma.diagnosticTest.findUnique.mockResolvedValue(testWithCentres);

    const res = await request(app).get(`/api/tests/${TEST_ID}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe(TEST_ID);
    expect(res.body.data.availableAt).toHaveLength(1);
    expect(res.body.data.availableAt[0].price).toBe('299.00');
  });

  it('should return 404 for a nonexistent test ID', async () => {
    prisma.diagnosticTest.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/tests/nonexistent-id');

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CENTRE / TEST RELATIONSHIP  (POST /api/centres/:id/tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/centres/:id/tests', () => {
  it('should add a test to a centre with the correct price and return 201', async () => {
    prisma.diagnosticCentre.findUnique.mockResolvedValue(fakeCentre());
    prisma.diagnosticTest.findUnique.mockResolvedValue(fakeTest());
    prisma.centreTest.create.mockResolvedValue(fakeCentreTest());

    const res = await request(app)
      .post(`/api/centres/${CENTRE_ID}/tests`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ testId: TEST_ID, price: 299 });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.centreId).toBe(CENTRE_ID);
    expect(res.body.data.testId).toBe(TEST_ID);
    // Price must be stored and returned correctly
    expect(Number(res.body.data.price)).toBe(299);
  });

  it('should return 401 when not authenticated', async () => {
    const res = await request(app)
      .post(`/api/centres/${CENTRE_ID}/tests`)
      .send({ testId: TEST_ID, price: 299 });

    expect(res.statusCode).toBe(401);
  });

  it('should return 400 when testId is missing', async () => {
    const res = await request(app)
      .post(`/api/centres/${CENTRE_ID}/tests`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ price: 299 });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('testId')])
    );
  });

  it('should return 400 when price is missing', async () => {
    const res = await request(app)
      .post(`/api/centres/${CENTRE_ID}/tests`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ testId: TEST_ID });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Price')])
    );
  });

  it('should return 400 when price is negative', async () => {
    const res = await request(app)
      .post(`/api/centres/${CENTRE_ID}/tests`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ testId: TEST_ID, price: -50 });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('non-negative')])
    );
  });

  it('should return 404 when centre does not exist', async () => {
    prisma.diagnosticCentre.findUnique.mockResolvedValue(null); // centre not found
    prisma.diagnosticTest.findUnique.mockResolvedValue(fakeTest());

    const res = await request(app)
      .post(`/api/centres/bad-centre-id/tests`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ testId: TEST_ID, price: 299 });

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/centre not found/i);
  });

  it('should return 404 when test does not exist', async () => {
    prisma.diagnosticCentre.findUnique.mockResolvedValue(fakeCentre());
    prisma.diagnosticTest.findUnique.mockResolvedValue(null); // test not found

    const res = await request(app)
      .post(`/api/centres/${CENTRE_ID}/tests`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ testId: 'bad-test-id', price: 299 });

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/test not found/i);
  });

  it('should return 409 when centre already offers the test', async () => {
    prisma.diagnosticCentre.findUnique.mockResolvedValue(fakeCentre());
    prisma.diagnosticTest.findUnique.mockResolvedValue(fakeTest());
    // Simulate Prisma unique constraint error (P2002)
    const uniqueError = new Error('Unique constraint failed');
    uniqueError.code = 'P2002';
    prisma.centreTest.create.mockRejectedValue(uniqueError);

    const res = await request(app)
      .post(`/api/centres/${CENTRE_ID}/tests`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ testId: TEST_ID, price: 299 });

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already offers/i);
  });
});
