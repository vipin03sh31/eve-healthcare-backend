const prisma = require('../config/database');
const { sendSuccess } = require('../utils/response');

/**
 * GET /api/health
 * Basic health-check endpoint.
 * Verifies the server is running and can reach the database.
 */
const healthCheck = async (req, res, next) => {
  try {
    // Ping the database to confirm connectivity
    await prisma.$queryRaw`SELECT 1`;

    return sendSuccess(
      res,
      {
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        database: 'connected',
      },
      'EVE Healthcare API is running'
    );
  } catch (error) {
    // Server is up but DB is unreachable — still return 200 with degraded status
    return sendSuccess(
      res,
      {
        status: 'degraded',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      },
      'EVE Healthcare API is running (database unavailable)',
      200
    );
  }
};

module.exports = { healthCheck };
