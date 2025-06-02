// backend/src/employeeAuth/employeeAuthController.test.js

const httpMocks = require('node-mocks-http');
const jwt = require('jsonwebtoken');
const authController = require('./authController');
const passwordUtils = require('./passwordUtils');
const db = require('../config/db');

// Mock dependencies
jest.mock('../config/db', () => ({
  executeQuery: jest.fn()
}));

jest.mock('./passwordUtils', () => ({
  verifyPassword: jest.fn()
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mocked_token')
}));

describe('EmployeeAuthController', () => {
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    console.error.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test_secret';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.JWT_COOKIE_EXPIRES_IN = '30';
  });

  describe('login', () => {
    it('should return 200 with token for valid credentials', async () => {
      const req = httpMocks.createRequest({
        body: {
          username: 'valid_user',
          password: 'correct_password'
        }
      });
      const res = httpMocks.createResponse();

      db.executeQuery.mockResolvedValue({
        recordset: [{
          id: 1,
          username: 'valid_user',
          password: 'hashed_password',
          role: 'employee'
        }]
      });

      passwordUtils.verifyPassword.mockResolvedValue(true);

      await authController.login(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({
        status: 'success',
        token: 'mocked_token',
        data: {
          user: expect.objectContaining({
            id: 1,
            username: 'valid_user',
            role: 'employee'
          })
        }
      });
      expect(jwt.sign).toHaveBeenCalledWith(
        {
          id: 1,
          username: 'valid_user',
          role: 'employee'
        },
        'test_secret',
        { expiresIn: '1h' }
      );
    });

    it('should return 401 when user is not found', async () => {
      const req = httpMocks.createRequest({
        body: {
          username: 'unknown_user',
          password: 'any_password'
        }
      });
      const res = httpMocks.createResponse();

      db.executeQuery.mockResolvedValue({ recordset: [] });

      await authController.login(req, res);

      expect(res.statusCode).toBe(401);
      expect(res._getJSONData()).toEqual({
        status: 'fail',
        message: 'Incorrect username or password'
      });
      expect(passwordUtils.verifyPassword).not.toHaveBeenCalled();
    });

    it('should return 401 for incorrect password', async () => {
      const req = httpMocks.createRequest({
        body: {
          username: 'valid_user',
          password: 'wrong_password'
        }
      });
      const res = httpMocks.createResponse();

      db.executeQuery.mockResolvedValue({
        recordset: [{
          id: 1,
          username: 'valid_user',
          password: 'hashed_password',
          role: 'employee'
        }]
      });

      passwordUtils.verifyPassword.mockResolvedValue(false);

      await authController.login(req, res);

      expect(res.statusCode).toBe(401);
      expect(res._getJSONData()).toEqual({
        status: 'fail',
        message: 'Incorrect username or password'
      });
      expect(passwordUtils.verifyPassword).toHaveBeenCalledWith(
        'wrong_password',
        'hashed_password'
      );
    });

    it('should return 400 for missing credentials', async () => {
      const testCases = [
        { username: '', password: 'password' },
        { username: 'valid_user', password: '' },
        { username: '', password: '' }
      ];

      for (const body of testCases) {
        const req = httpMocks.createRequest({ body });
        const res = httpMocks.createResponse();

        await authController.login(req, res);

        expect(res.statusCode).toBe(400);
        expect(res._getJSONData()).toEqual({
          status: 'fail',
          message: 'Please provide username and password'
        });
      }
    });

    it('should return 400 for invalid username format', async () => {
      const req = httpMocks.createRequest({
        body: {
          username: 'inv@lid!',
          password: 'valid_password'
        }
      });
      const res = httpMocks.createResponse();

      await authController.login(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData()).toEqual({
        status: 'fail',
        message: 'Invalid username format'
      });
    });

    it('should handle database errors with 500 status', async () => {
      const req = httpMocks.createRequest({
        body: {
          username: 'valid_user',
          password: 'correct_password'
        }
      });
      const res = httpMocks.createResponse();

      db.executeQuery.mockRejectedValue(new Error('Database failure'));

      await authController.login(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._getJSONData()).toEqual({
        status: 'error',
        message: 'An error occurred during login'
      });
      expect(console.error).toHaveBeenCalledWith(
        'Login error:',
        expect.any(Error)
      );
    });

    it('should handle bcrypt.compare() errors', async () => {
      const req = httpMocks.createRequest({
        body: {
          username: 'valid_user',
          password: 'correct_password'
        }
      });
      const res = httpMocks.createResponse();

      db.executeQuery.mockResolvedValue({
        recordset: [{
          id: 1,
          username: 'valid_user',
          password: 'hashed_password',
          role: 'employee'
        }]
      });

      passwordUtils.verifyPassword.mockRejectedValue(new Error('Bcrypt error'));

      await authController.login(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._getJSONData()).toEqual({
        status: 'error',
        message: 'An error occurred during login'
      });
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle JWT signing errors', async () => {
      const req = httpMocks.createRequest({
        body: {
          username: 'valid_user',
          password: 'correct_password'
        }
      });
      const res = httpMocks.createResponse();

      db.executeQuery.mockResolvedValue({
        recordset: [{
          id: 1,
          username: 'valid_user',
          password: 'hashed_password',
          role: 'employee'
        }]
      });

      passwordUtils.verifyPassword.mockResolvedValue(true);
      jwt.sign.mockImplementation(() => {
        throw new Error('JWT error');
      });

      await authController.login(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._getJSONData()).toEqual({
        status: 'error',
        message: 'An error occurred during login'
      });
      expect(console.error).toHaveBeenCalled();
    });
  });
});
