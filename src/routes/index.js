const { Router } = require('express');
const healthRoutes  = require('./health.routes');
const authRoutes    = require('./auth.routes');
const centreRoutes  = require('./centre.routes');
const testRoutes    = require('./test.routes');
const bookingRoutes = require('./booking.routes');
const paymentRoutes = require('./payment.routes');

const router = Router();

// ─── Mount route modules ───────────────────────────────────────────────────
// Future route modules will be added here in subsequent steps:
//   router.use('/users',   require('./user.routes'));

router.use('/health',   healthRoutes);
router.use('/auth',     authRoutes);
router.use('/centres',  centreRoutes);
router.use('/tests',    testRoutes);
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);

module.exports = router;

