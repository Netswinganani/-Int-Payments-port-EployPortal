const express = require('express');
const router = express.Router();
const authController = require('../employeeAuth/authController');
const paymentController = require('../employeeController/paymentController');
const { protect, csrfProtection } = require('../employeeMiddleware/authMiddleware');

//  Public routes
router.post('/login', authController.login);
router.get('/csrf-token', authController.getCsrfToken); // ✅ Add this line

//  Protected routes (require authentication)
router.use(protect);
router.get('/users', paymentController.getAllCustomers);
router.get('/profile', authController.getProfile);
router.get('/payments', paymentController.getPayments);
router.get('/payments/:id', paymentController.getPaymentById);
// routes/employee.js (or similar)


router.use(csrfProtection);
router.get('/payment-history', paymentController.getPaymentHistory); // ✅ no duplicate auth
router.post('/logout', authController.logout);
router.post('/payments/:id/process', paymentController.processPayment);
router.post('/payments/:id/cancel', paymentController.cancelPayment); // ✅ CSRF protection

//  CSRF protection for state-changing requests (must come AFTER `/csrf-token`)


// Other POST/PUT/DELETE routes go below
// e.g. router.post('/some-state-changing-action', ...);

module.exports = router;
