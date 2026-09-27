/**
 * Authentication integration tests.
 *
 * These tests use Supertest to fire HTTP requests against the real Express app.
 * The Prisma client is mocked so no PostgreSQL instance is needed during CI.
 *
 * Coverage:
 *  Signup  – success, missing fields, invalid email, duplicate email, weak password
 *  Login   – success, wrong password, nonexistent user, missing fields
 *  JWT     – valid token, missing header, invalid token, expired token
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_do_not_use_in_production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS = '1';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── Mock the Prisma singleton BEFORE requiring app ───────────────────────
jest.mock('../config/database', () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  $disconnect: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../config/database');
const app = require('../app');

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const VALID_SIGNUP = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'Password1',
};

const buildFakeUser = (overrides = {}) => ({
  id: 'uuid-1234',
  name: 'Test User',
  email: 'test@example.com',
  passwordHash: bcrypt.hashSync('Password1', 1),
  phone: null,
  role: 'PATIENT',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

afterEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/signup
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/signup', () => {
  // ── Successful signup ────────────────────────────────────────────────────
  it('should create a new account and return a JWT', async () => {
    const fakeUser = buildFakeUser();
    prisma.user.findUnique.mockResolvedValue(null);   // no duplicate
    prisma.user.create.mockResolvedValue(fakeUser);

    const res = await request(app).post('/api/auth/signup').send(VALID_SIGNUP);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('user');

    // Must NOT expose the password hash
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.user).not.toHaveProperty('password_hash');

    // Token must be a valid JWT
    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
    expect(decoded.email).toBe(fakeUser.email);
    expect(decoded.role).toBe('PATIENT');
  });

  // ── Missing required fields ───────────────────────────────────────────────
  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'a@b.com', password: 'Password1' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringContaining('Name')]));
  });

  it('should return 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Test', password: 'Password1' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringContaining('Email')]));
  });

  it('should return 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Test', email: 'a@b.com' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringContaining('Password')]));
  });

  // ── Invalid email ────────────────────────────────────────────────────────
  it('should return 400 for an invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Test', email: 'not-an-email', password: 'Password1' });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('valid email')])
    );
  });

  // ── Weak password ────────────────────────────────────────────────────────
  it('should return 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Test', email: 'a@b.com', password: 'Abc1' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('8 characters')])
    );
  });

  it('should return 400 when password has no digit', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Test', email: 'a@b.com', password: 'NoDigitsHere' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('digit')])
    );
  });

  it('should return 400 when password has no letter', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Test', email: 'a@b.com', password: '12345678' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('letter')])
    );
  });

  // ── Duplicate email ───────────────────────────────────────────────────────
  it('should return 409 when email is already registered', async () => {
    prisma.user.findUnique.mockResolvedValue(buildFakeUser());

    const res = await request(app).post('/api/auth/signup').send(VALID_SIGNUP);

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already exists/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/login
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/login', () => {
  // ── Successful login ─────────────────────────────────────────────────────
  it('should return a JWT on valid credentials', async () => {
    const fakeUser = buildFakeUser();
    prisma.user.findUnique.mockResolvedValue(fakeUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password1' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
    expect(decoded.sub).toBe(fakeUser.id);
  });

  // ── Wrong password ───────────────────────────────────────────────────────
  it('should return 401 for a wrong password', async () => {
    const fakeUser = buildFakeUser();
    prisma.user.findUnique.mockResolvedValue(fakeUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // ── Non-existent user ────────────────────────────────────────────────────
  it('should return 401 for a non-existent email (no user enumeration)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password1' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    // Should not reveal whether email exists or not
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  // ── Missing fields ───────────────────────────────────────────────────────
  it('should return 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Password1' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Email')])
    );
  });

  it('should return 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Password')])
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// JWT Middleware — tested via a self-contained mini Express app
//
// We create a fresh Express app with only the authenticate middleware and a
// single test route. This avoids any route-ordering issues with the main app's
// 404 handler being registered before dynamic test routes.
// ═════════════════════════════════════════════════════════════════════════════

describe('JWT authenticate middleware', () => {
  const express = require('express');
  const authenticate = require('../middleware/authenticate');

  // Build a minimal app for these tests only
  const miniApp = express();
  miniApp.use(express.json());
  miniApp.get('/protected', authenticate, (req, res) => {
    res.json({ success: true, user: req.user });
  });

  // ── Valid token ───────────────────────────────────────────────────────────
  it('should allow access with a valid JWT', () => {
    const token = jwt.sign(
      { sub: 'uid-1', email: 'a@b.com', role: 'PATIENT' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return request(miniApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.user.sub).toBe('uid-1');
      });
  });

  // ── Missing Authorization header ─────────────────────────────────────────
  it('should return 401 when Authorization header is absent', () => {
    return request(miniApp)
      .get('/protected')
      .expect(401)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/authorization header/i);
      });
  });

  // ── Invalid token ─────────────────────────────────────────────────────────
  it('should return 401 for a tampered / invalid token', () => {
    return request(miniApp)
      .get('/protected')
      .set('Authorization', 'Bearer this.is.not.a.valid.jwt')
      .expect(401)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/invalid token/i);
      });
  });

  // ── Expired token ─────────────────────────────────────────────────────────
  it('should return 401 for an expired token', () => {
    const token = jwt.sign(
      { sub: 'uid-1', email: 'a@b.com', role: 'PATIENT' },
      process.env.JWT_SECRET,
      { expiresIn: '0s' } // expires immediately
    );

    return request(miniApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/expired/i);
      });
  });

  // ── Wrong scheme ──────────────────────────────────────────────────────────
  it('should return 401 when scheme is not Bearer', () => {
    return request(miniApp)
      .get('/protected')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .expect(401)
      .expect((res) => {
        expect(res.body.success).toBe(false);
      });
  });
});
