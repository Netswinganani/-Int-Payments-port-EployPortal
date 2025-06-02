// backend/src/employeeAuth/employeePaymentsController.test.js

// Set environment variables for encryption (required by paymentController)
process.env.ENCRYPTION_SECRET_KEY = '0123456789abcdef0123456789abcdef'; // 32 hex chars = 16 bytes
process.env.IV = 'abcdef9876543210abcdef9876543210'; // 32 hex chars = 16 bytes

const httpMocks = require('node-mocks-http');
const paymentController = require('../employeeController/paymentController');
const db = require('../config/db');

// Mock the database module
jest.mock('../config/db', () => ({
  executeQuery: jest.fn()
}));

describe('Employee Payments Controller', () => {
  const employeeId = 123;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPaymentHistory (getEmployeePayments)', () => {
    it('should return 200 with payment history when payments exist', async () => {
      const req = httpMocks.createRequest({
        user: { id: employeeId },
        query: { page: '1', limit: '10' }
      });
      const res = httpMocks.createResponse();

      const mockPayments = [
        { id: 1, amount: 100, currency: 'USD' },
        { id: 2, amount: 200, currency: 'EUR' }
      ];

      db.executeQuery
        .mockResolvedValueOnce({ recordset: mockPayments }) // Payments
        .mockResolvedValueOnce({ recordset: [{ total: 2 }] }); // Count

      await paymentController.getPaymentHistory(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({
        status: 'success',
        data: { payments: mockPayments },
        pagination: { totalPages: 1 }
      });

      expect(db.executeQuery).toHaveBeenCalledTimes(2);
      expect(db.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM payment_history'),
        expect.objectContaining({ userId: employeeId })
      );
    });

    it('should return 200 with empty array when no payments found', async () => {
      const req = httpMocks.createRequest({
        user: { id: employeeId },
        query: {}
      });
      const res = httpMocks.createResponse();

      db.executeQuery
        .mockResolvedValueOnce({ recordset: [] }) // No payments
        .mockResolvedValueOnce({ recordset: [{ total: 0 }] }); // Total count = 0

      await paymentController.getPaymentHistory(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({
        status: 'success',
        data: { payments: [] },
        pagination: { totalPages: 0 }
      });
    });

    it('should return 500 when database query fails', async () => {
      const req = httpMocks.createRequest({
        user: { id: employeeId },
        query: { page: '1' }
      });
      const res = httpMocks.createResponse();

      // Optional: Suppress expected error log
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      db.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await paymentController.getPaymentHistory(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._getJSONData()).toEqual({
        status: 'error',
        message: 'Failed to load payment history'
      });

      consoleSpy.mockRestore();
    });

    it('should handle date filters correctly', async () => {
      const req = httpMocks.createRequest({
        user: { id: employeeId },
        query: {
          startDate: '2023-01-01',
          endDate: '2023-01-31'
        }
      });
      const res = httpMocks.createResponse();

      await paymentController.getPaymentHistory(req, res);

      expect(db.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('transaction_date >= @startDate'),
        expect.objectContaining({
          startDate: '2023-01-01',
          endDate: '2023-01-31'
        })
      );
    });

    it('should handle status filter correctly', async () => {
      const req = httpMocks.createRequest({
        user: { id: employeeId },
        query: { status: 'processed' }
      });
      const res = httpMocks.createResponse();

      await paymentController.getPaymentHistory(req, res);

      expect(db.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = @status'),
        expect.objectContaining({ status: 'processed' })
      );
    });

    it('should calculate pagination correctly', async () => {
      const req = httpMocks.createRequest({
        user: { id: employeeId },
        query: { page: '2', limit: '5' }
      });
      const res = httpMocks.createResponse();

      db.executeQuery
        .mockResolvedValueOnce({ recordset: [] }) // Payments
        .mockResolvedValueOnce({ recordset: [{ total: 15 }] }); // Total count

      await paymentController.getPaymentHistory(req, res);

      const responseData = res._getJSONData();
      expect(responseData.pagination.totalPages).toBe(3); // 15 / 5 = 3 pages

      expect(db.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('OFFSET @offset ROWS'),
        expect.objectContaining({ offset: 5 }) // (page-1)*limit = (2-1)*5 = 5
      );
    });
  });
});
