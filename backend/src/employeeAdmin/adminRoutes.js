// backend/src/employeeAdmin/adminRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../employeeAuth/authController');
const { protect, restrictTo, csrfProtection } = require('../employeeMiddleware/authMiddleware');
const adminController = require('./adminController');

// All routes in this file require authentication
router.use(protect);

// All routes below require admin privileges
router.use(restrictTo('admin'));

// Apply CSRF protection to state-changing routes
router.use(csrfProtection);

// Admin routes for user management
router.post('/users', authController.createEmployee);
router.get('/users', adminController.getAllEmployees);
router.get('/users/:id', adminController.getEmployeeById);
router.put('/users/:id', adminController.updateEmployee);
router.delete('/users/:id', adminController.deleteEmployee);

module.exports = router;