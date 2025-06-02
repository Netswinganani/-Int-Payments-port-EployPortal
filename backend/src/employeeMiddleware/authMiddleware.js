
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/db');

exports.protect = async (req, res, next) => {
  try {
    const token = req.cookies.jwt;

    if (!token) {
      return res.status(401).json({
        status: 'fail',
        message: 'You are not logged in. Please log in to get access.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from Users table
    const result = await executeQuery(
      `SELECT id, username, email, role,
              CASE WHEN role = 'customer' THEN accountNumber ELSE NULL END AS accountNumber,
              CASE WHEN role = 'customer' THEN balance ELSE NULL END AS balance
       FROM Users 
       WHERE id = @id`,
      { id: decoded.id }
    );

    const user = result.recordset[0];

    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'The user no longer exists.'
      });
    }

    // Attach the user data to the request
    req.user = user;
    next();

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({
      status: 'fail',
      message: 'Authentication failed'
    });
  }
};

/**
 * Middleware to restrict routes to certain user roles
 * @param {String[]} roles - Array of roles allowed to access the route
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // Check if user has required role
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action'
      });
    }

    next();
  };
};

/**
 * Middleware to check if CSRF token is valid
 * This provides protection against CSRF attacks
 */
exports.csrfProtection = (req, res, next) => {
  const csrfToken = req.headers['x-csrf-token'];
  const storedToken = req.cookies.csrfToken;

  if (!csrfToken || !storedToken || csrfToken !== storedToken) {
    return res.status(403).json({
      status: 'fail',
      message: 'CSRF token validation failed'
    });
  }

  next();
};

/**
 * Generates a CSRF token for the client
 */
exports.generateCsrfToken = (req, res, next) => {
  const crypto = require('crypto');
  const csrfToken = crypto.randomBytes(20).toString('hex');
  
  // Set CSRF token in a cookie
  res.cookie('csrfToken', csrfToken, {
    httpOnly: false, // Needs to be accessible by JavaScript
    secure: process.env.NODE_ENV === 'production', 
    sameSite: 'Strict'
  });
  
  // Add token to response for frontend to use in headers
  res.locals.csrfToken = csrfToken;
  next();
};