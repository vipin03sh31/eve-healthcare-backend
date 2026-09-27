const { Router } = require('express');
const { createTest, getAllTests, getTestById } = require('../controllers/test.controller');
const authenticate = require('../middleware/authenticate');

const router = Router();

/**
 * @route  GET /api/tests
 * @desc   List all diagnostic tests (global catalogue)
 * @access Public
 */
router.get('/', getAllTests);

/**
 * @route  GET /api/tests/:id
 * @desc   Get a single diagnostic test by ID (includes where it is available)
 * @access Public
 */
router.get('/:id', getTestById);

/**
 * @route  POST /api/tests
 * @desc   Create a new diagnostic test in the catalogue
 * @access Private (authenticated)
 */
router.post('/', authenticate, createTest);

module.exports = router;
