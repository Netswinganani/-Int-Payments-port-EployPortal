// backend/src/employeeAuth/authController.js
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/db');
const { hashPassword, verifyPassword } = require('./passwordUtils');
const { sql } = require('mssql');
const crypto = require('crypto');

/**
 * Generate JWT token for user authentication
 * @param {Object} user - User object with id and role properties
 * @returns {String} jwt token
 */
const signToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      username: user.username,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN
    }
  );
};

/**
 * Create and send JWT token via HttpOnly cookie
 */
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true, // Cannot be accessed by browser JavaScript
    secure: process.env.NODE_ENV === 'production', // Only sent over HTTPS
    sameSite: 'strict' // Protection against CSRF
  };

  res.cookie('jwt', token, cookieOptions);


  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};
// Exported route handler for CSRF token generation
exports.getCsrfToken = (req, res) => {
   const csrfToken = require('crypto').randomBytes(32).toString('hex');
  res.cookie('csrfToken', csrfToken, {
    httpOnly: false,     // must be false so frontend JS can read it
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production'
  });
  res.status(200).json({ csrfToken });
};


exports.createSendToken = createSendToken;
/**
 * Login user with username and password
 */
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1) Check if username and password exist
    if (!username || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide username and password'
      });
    }

    // 2) Validate input against whitelist RegEx
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid username format'
      });
    }

    // 3) Check if user exists && password is correct
    const result = await executeQuery(`
      SELECT id, username, email, password, accountNumber, balance, role
      FROM Users 
      WHERE username = @username
    `, {
      username: username
    });

    const user = result.recordset[0];

    if (!user || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Incorrect username or password'
      });
    }

    // 4) If everything ok, send token to client
    createSendToken(user, 200, res);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred during login'
    });
  }
};

/**
 * Create a new employee account (admin only)
 */
exports.createEmployee = async (req, res) => {
  try {
    const { username, email, password, idNumber, accountNumber, role } = req.body;

    // 1) Validate inputs
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const idNumberRegex = /^[A-Z0-9]{5,15}$/;
    const accountNumberRegex = /^[0-9]{8,20}$/;

    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid username format'
      });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid email format'
      });
    }

    if (!idNumberRegex.test(idNumber)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid ID number format'
      });
    }

    if (!accountNumberRegex.test(accountNumber)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid account number format'
      });
    }

    // 2) Check if user already exists
    const existingUser = await executeQuery(`
      SELECT id FROM Users WHERE username = @username OR email = @email
    `, {
      username,
      email
    });

    if (existingUser.recordset.length > 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'User with this username or email already exists'
      });
    }

    // 3) Hash password
    const hashedPassword = await hashPassword(password);

    // 4) Create new employee
    const result = await executeQuery(`
      INSERT INTO Users (username, email, password, idNumber, accountNumber, balance, role)
      VALUES (@username, @email, @password, @idNumber, @accountNumber, @balance, @role);
      SELECT SCOPE_IDENTITY() AS id;
    `, {
      username,
      email,
      password: hashedPassword,
      idNumber,
      accountNumber,
      balance: 0.0,
      role: role || 'employee'
    });

    // 5) Send response
    res.status(201).json({
      status: 'success',
      data: {
        id: result.recordset[0].id,
        username,
        email,
        accountNumber,
        role: role || 'employee'
      }
    });
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while creating employee'
    });
  }
};

/**
 * Logout user by clearing JWT cookie
 */
exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  res.cookie('csrfToken', '', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: false
  });
  
  res.status(200).json({ status: 'success' });
};

/**
 * Get current user's profile information
 */
exports.getProfile = async (req, res) => {
  try {
    const result = await executeQuery(
      `SELECT id, username, email, accountNumber, balance, role FROM Users WHERE id = @userId`,
      { userId: req.user.id }
    );

    if (!result.recordset.length) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    const user = result.recordset[0];

    res.status(200).json({
      status: 'success',
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Could not fetch user profile'
    });
  }
};
