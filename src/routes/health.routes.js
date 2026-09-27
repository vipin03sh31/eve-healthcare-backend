const { Router } = require('express');
const { healthCheck } = require('../controllers/health.controller');

const router = Router();

/**
 * @route   GET /api/health
 * @desc    Health-check — confirms server + database connectivity
 * @access  Public
 */
router.get('/', healthCheck);

module.exports = router;
