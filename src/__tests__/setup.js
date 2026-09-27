/**
 * Shared Jest test setup.
 *
 * - Sets NODE_ENV to 'test' so the app suppresses morgan logging.
 * - Disconnects Prisma after all tests to prevent open handle warnings.
 */

process.env.NODE_ENV = 'test';

// Override JWT settings with test-specific values so tests are deterministic
// and don't depend on whatever is in the developer's .env.
process.env.JWT_SECRET = 'test_jwt_secret_do_not_use_in_production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.BCRYPT_ROUNDS = '1'; // 1 round — fast for tests, insecure in prod

const prisma = require('../config/database');

afterAll(async () => {
  await prisma.$disconnect();
});
