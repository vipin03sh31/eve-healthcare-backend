require('dotenv').config();

// ─── Fail-fast secret validation ─────────────────────────────────────────────
// JWT_SECRET is a security-critical value and must never fall back to a
// hardcoded string. Catch the misconfiguration at startup — before the server
// accepts any requests — so a missing secret cannot be silently exploited.
//
// Skip the check in Jest test runs: tests set JWT_SECRET themselves in
// process.env before requiring this module.
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'test') {
  console.error('[Config] FATAL: JWT_SECRET is not set in the environment.');
  console.error('[Config] Set JWT_SECRET in your .env file and restart.');
  process.exit(1);
}

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  jwt: {
    // No fallback — value is guaranteed by the check above (or by the test env).
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
  },
};

module.exports = config;
