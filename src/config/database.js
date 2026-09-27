const { PrismaClient } = require('@prisma/client');

// Re-use the Prisma client singleton across the app.
// In development, hot-reloads would otherwise create multiple connections.
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  }
  prisma = global.__prisma;
}

module.exports = prisma;
