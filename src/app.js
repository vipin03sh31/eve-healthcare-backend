require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ─── Security & utility middleware ────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP request logger (skip in test environment to keep output clean)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ─── API routes ───────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── Root route ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'EVE Healthcare API',
    version: '1.0.0',
    docs: '/api/health',
  });
});

// ─── 404 & global error handling ─────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
