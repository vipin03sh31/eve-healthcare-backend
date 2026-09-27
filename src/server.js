require('dotenv').config();

const app = require('./app');
const config = require('./config');
const prisma = require('./config/database');

const { port, nodeEnv } = config.server;

const server = app.listen(port, () => {
  console.log('─────────────────────────────────────────────');
  console.log(`  EVE Healthcare API`);
  console.log(`  Environment : ${nodeEnv}`);
  console.log(`  Port        : ${port}`);
  console.log(`  Health      : http://localhost:${port}/api/health`);
  console.log('─────────────────────────────────────────────');
});

// ─── Graceful shutdown ────────────────────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('[Server] Database connection closed. Goodbye.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Unhandled rejections ────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Promise Rejection:', reason);
  shutdown('unhandledRejection');
});

module.exports = server;
