const { Router } = require('express');
const {
  createCentre,
  getAllCentres,
  getCentreById,
  addTestToCentre,
} = require('../controllers/centre.controller');
const authenticate = require('../middleware/authenticate');

const router = Router();

/**
 * @route  GET /api/centres
 * @desc   List all diagnostic centres (with active test offerings)
 * @access Public
 */
router.get('/', getAllCentres);

/**
 * @route  GET /api/centres/:id
 * @desc   Get a single diagnostic centre by ID
 * @access Public
 */
router.get('/:id', getCentreById);

/**
 * @route  POST /api/centres
 * @desc   Create a new diagnostic centre
 * @access Private (authenticated)
 */
router.post('/', authenticate, createCentre);

/**
 * @route  POST /api/centres/:id/tests
 * @desc   Add a diagnostic test offering to a centre (with price)
 * @access Private (authenticated)
 */
router.post('/:id/tests', authenticate, addTestToCentre);

module.exports = router;
