//
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');
const path = require('path');
const https = require('https');
const fs = require('fs');

// Import routes and controllers
const employeeRoutes = require('./employeeRoutes/employeeRoutes');
const adminRoutes = require('./employeeAdmin/adminRoutes');
const authController = require('./employeeAuth/authController');

// Init express
const app = express();

// --- 1. Security middleware ---
app.use(helmet());
app.use(xss());

// --- 2. CORS ---
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : 'http://localhost:5173',
  credentials: true
}));

// --- 3. Body & Cookie parsers (needed before CSRF middleware) ---
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// --- 4. CSRF Token Endpoint (must come before CSRF protection middleware) ---
app.get('/api/csrf-token', authController.getCsrfToken);

// --- 5. CSRF Protection Middleware ---
const csrfProtection = (req, res, next) => {
  // ✅ Skip CSRF for login route
  if (req.path === '/api/employee/login') return next();

  const csrfTokenFromCookie = req.cookies['csrfToken'];
  const csrfTokenFromHeader = req.get('X-CSRF-Token');

  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
    (!csrfTokenFromCookie || !csrfTokenFromHeader || csrfTokenFromCookie !== csrfTokenFromHeader)
  ) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }

  next();
};
app.use(csrfProtection);

// --- 6. Rate limiting ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again after 15 minutes'
});
app.use('/api/employee/login', loginLimiter);

// --- 7. Routes ---
app.use('/api/employee', employeeRoutes);
app.use('/api/admin', adminRoutes);

// --- 8. Error handling middleware ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// --- 9. Start server ---
const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV === 'development' && process.env.USE_HTTPS === 'true') {
  try {
    const httpsOptions = {
       key: fs.readFileSync(path.join(__dirname, '../../certs/localhost-key.pem')),
       cert: fs.readFileSync(path.join(__dirname, '../../certs/localhost.pem'))
    };

    https.createServer(httpsOptions, app).listen(PORT, () => {
      console.log(`HTTPS Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Could not start HTTPS server:', error);
    console.log('Falling back to HTTP...');
    app.listen(PORT, () => {
      console.log(`HTTP Server running on port ${PORT}`);
    });
  }
} else {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app; // For testing
