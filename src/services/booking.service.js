const prisma = require('../config/database');
const AppError = require('../utils/AppError');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard Prisma include clause — embed full context in every booking response.
 */
const BOOKING_INCLUDE = {
  centreTest: {
    include: {
      test: { select: { id: true, name: true, description: true, turnaround: true } },
    },
  },
  centre: { select: { id: true, name: true, city: true, state: true, address: true } },
  user:   { select: { id: true, name: true, email: true } },
};

/**
 * Shape a raw Prisma booking into a clean response object.
 * Omits internal relation-id fields that are already represented by nested objects.
 */
const formatBooking = (booking) => ({
  id:          booking.id,
  status:      booking.status,
  scheduledAt: booking.scheduledAt,
  amount:      booking.amount,
  notes:       booking.notes,
  createdAt:   booking.createdAt,
  updatedAt:   booking.updatedAt,
  user: booking.user,
  centre: booking.centre,
  test: {
    centreTestId: booking.centreTest.id,
    testId:       booking.centreTest.test.id,
    name:         booking.centreTest.test.name,
    description:  booking.centreTest.test.description,
    turnaround:   booking.centreTest.test.turnaround,
    price:        booking.centreTest.price,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Service functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new booking for an authenticated user.
 *
 * Business rules enforced here:
 *  - centreTestId must reference an active CentreTest offering.
 *  - The booking amount is ALWAYS snapshotted from the CentreTest price —
 *    the client cannot supply the amount.
 *  - scheduledAt must be a future date/time.
 *  - Initial status is always PENDING.
 *
 * @param {string} userId - from JWT (never from request body)
 * @param {{ centreTestId: string, scheduledAt: string, notes?: string }} dto
 * @returns {object} formatted booking
 */
const createBooking = async (userId, { centreTestId, scheduledAt, notes }) => {
  // ── 1. Resolve the CentreTest offering ────────────────────────────────────
  const centreTest = await prisma.centreTest.findUnique({
    where: { id: centreTestId },
    include: {
      centre: { select: { id: true } },
    },
  });

  if (!centreTest) {
    throw new AppError('The specified test offering does not exist.', 404);
  }

  if (!centreTest.isActive) {
    throw new AppError('This test offering is not currently available for booking.', 422);
  }

  // ── 2. Parse & validate scheduledAt ───────────────────────────────────────
  const scheduledDate = new Date(scheduledAt);

  if (isNaN(scheduledDate.getTime())) {
    throw new AppError('scheduledAt must be a valid ISO 8601 date/time.', 400);
  }

  if (scheduledDate <= new Date()) {
    throw new AppError('Appointment date/time must be in the future.', 400);
  }

  // ── 3. Create the booking — snapshot price from CentreTest ───────────────
  const booking = await prisma.booking.create({
    data: {
      userId,
      centreId:    centreTest.centre.id,
      centreTestId,
      scheduledAt: scheduledDate,
      status:      'PENDING',
      amount:      centreTest.price,   // ← always from CentreTest, never from client
      notes:       notes ? notes.trim() : null,
    },
    include: BOOKING_INCLUDE,
  });

  return formatBooking(booking);
};

/**
 * Get a single booking by ID.
 * Enforces ownership — throws 403 if the booking belongs to a different user.
 *
 * @param {string} bookingId
 * @param {string} requestingUserId - from JWT
 * @returns {object} formatted booking
 */
const getBookingById = async (bookingId, requestingUserId) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: BOOKING_INCLUDE,
  });

  if (!booking) {
    throw new AppError('Booking not found.', 404);
  }

  // Ownership check — return 403, not 404, so the booking existence is not leaked
  if (booking.userId !== requestingUserId) {
    throw new AppError('You are not authorized to view this booking.', 403);
  }

  return formatBooking(booking);
};

/**
 * List all bookings belonging to the authenticated user.
 *
 * @param {string} userId - from JWT
 * @returns {object[]} array of formatted bookings
 */
const getUserBookings = async (userId) => {
  const bookings = await prisma.booking.findMany({
    where: { userId },
    include: BOOKING_INCLUDE,
    orderBy: { scheduledAt: 'asc' },
  });

  return bookings.map(formatBooking);
};

module.exports = { createBooking, getBookingById, getUserBookings };
