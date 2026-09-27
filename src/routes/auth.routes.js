const { Router } = require('express');
const { signup, login } = require('../controllers/auth.controller');

const router = Router();

/**
 * @route  POST /api/auth/signup
 * @desc   Register a new patient account
 * @access Public
 */
router.post('/signup', signup);

/**
 * @route  POST /api/auth/login
 * @desc   Authenticate and receive a JWT
 * @access Public
 */
router.post('/login', login);

module.exports = router;
