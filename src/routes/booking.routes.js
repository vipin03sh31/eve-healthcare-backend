const { Router } = require('express');
const { createBooking, getUserBookings, getBookingById } = require('../controllers/booking.controller');
const authenticate = require('../middleware/authenticate');

const router = Router();

// All booking routes require authentication
router.use(authenticate);

/**
 * @route  POST /api/bookings
 * @desc   Create a new booking for the authenticated user
 * @access Private
 */
router.post('/', createBooking);

/**
 * @route  GET /api/bookings
 * @desc   List all bookings for the authenticated user
 * @access Private
 */
router.get('/', getUserBookings);

/**
 * @route  GET /api/bookings/:id
 * @desc   Get a single booking by ID (must belong to the authenticated user)
 * @access Private
 */
router.get('/:id', getBookingById);

module.exports = router;
