const { sendError } = require('../utils/response');

/**
 * 404 Not Found handler.
 * Registered after all valid routes to catch unmatched requests.
 */
const notFound = (req, res) => {
  return sendError(
    res,
    `Route ${req.method} ${req.originalUrl} not found.`,
    404
  );
};

module.exports = notFound;
