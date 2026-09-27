/**
 * Standardised API response helpers.
 * All handlers should use these to keep response shape consistent.
 */

/**
 * Send a success response.
 * @param {import('express').Response} res
 * @param {*} data
 * @param {string} [message]
 * @param {number} [statusCode=200]
 */
const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} [statusCode=500]
 * @param {*} [errors]
 */
const sendError = (res, message, statusCode = 500, errors = null) => {
  const body = {
    success: false,
    message,
  };

  if (errors) {
    body.errors = errors;
  }

  return res.status(statusCode).json(body);
};

/**
 * Send a created (201) response.
 */
const sendCreated = (res, data, message = 'Created successfully') => {
  return sendSuccess(res, data, message, 201);
};

module.exports = { sendSuccess, sendError, sendCreated };
