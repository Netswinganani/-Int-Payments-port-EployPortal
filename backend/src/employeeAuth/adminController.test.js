// backend/src/employeeAdmin/adminController.test.js
const httpMocks = require('node-mocks-http');
const adminController = require('../employeeAdmin/adminController');
const db = require('../config/db');
const passwordUtils = require('../employeeAuth/passwordUtils');

// Mock dependencies
jest.mock('../config/db', () => ({
  executeQuery: jest.fn()
}));

jest.mock('../employeeAuth/passwordUtils', () => ({
  hashPassword: jest.fn()
}));

describe('Employee Admin Controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllEmployees', () => {
    it('should return paginated employee data with status 200', async () => {
      db.executeQuery
        .mockResolvedValueOnce({
          recordset: [{ id: 1, username: 'emp1' }, { id: 2, username: 'emp2' }]
        })
        .mockResolvedValueOnce({
          recordset: [{ totalCount: 20 }]
        });

      const req = httpMocks.createRequest({
        query: { page: '2', limit: '5' }
      });
      const res = httpMocks.createResponse();

      await adminController.getAllEmployees(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({
        status: 'success',
        results: 2,
        data: { employees: expect.any(Array) },
        pagination: {
          page: 2,
          limit: 5,
          totalCount: 20,
          totalPages: 4,
          hasNextPage: true,
          hasPrevPage: true
        }
      });
    });

    it('should handle no employees found', async () => {
      db.executeQuery
        .mockResolvedValueOnce({ recordset: [] })
        .mockResolvedValueOnce({ recordset: [{ totalCount: 0 }] });

      const req = httpMocks.createRequest();
      const res = httpMocks.createResponse();

      await adminController.getAllEmployees(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().data.employees.length).toBe(0);
    });

    it('should handle database errors with status 500', async () => {
      db.executeQuery.mockRejectedValue(new Error('DB Error'));

      const req = httpMocks.createRequest();
      const res = httpMocks.createResponse();

      await adminController.getAllEmployees(req, res);

      expect(res.statusCode).toBe(500);
      expect(res._getJSONData().status).toBe('error');
    });

    it('should handle page beyond total pages gracefully', async () => {
      db.executeQuery
        .mockResolvedValueOnce({
          recordset: []  // No employees on page 10
        })
        .mockResolvedValueOnce({
          recordset: [{ totalCount: 5 }]
        });

      const req = httpMocks.createRequest({
        query: { page: '10', limit: '2' }
      });
      const res = httpMocks.createResponse();

      await adminController.getAllEmployees(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().pagination.page).toBe(10);
      expect(res._getJSONData().data.employees.length).toBe(0);
      expect(res._getJSONData().pagination.totalPages).toBe(3);
      expect(res._getJSONData().pagination.hasNextPage).toBe(false);
    });
  });

  describe('getEmployeeById', () => {
    it('should return employee by ID with status 200', async () => {
      db.executeQuery.mockResolvedValue({
        recordset: [{ id: 1, username: 'test_emp' }]
      });

      const req = httpMocks.createRequest({ params: { id: '1' } });
      const res = httpMocks.createResponse();

      await adminController.getEmployeeById(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().data.employee.id).toBe(1);
    });

    it('should return 400 for invalid ID format', async () => {
      const req = httpMocks.createRequest({ params: { id: 'invalid' } });
      const res = httpMocks.createResponse();

      await adminController.getEmployeeById(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData().message).toContain('Invalid');
    });

    it('should return 404 when employee not found', async () => {
      db.executeQuery.mockResolvedValue({ recordset: [] });

      const req = httpMocks.createRequest({ params: { id: '999' } });
      const res = httpMocks.createResponse();

      await adminController.getEmployeeById(req, res);

      expect(res.statusCode).toBe(404);
    });

    it('should handle database errors with status 500', async () => {
      db.executeQuery.mockRejectedValue(new Error('DB Error'));

      const req = httpMocks.createRequest({ params: { id: '1' } });
      const res = httpMocks.createResponse();

      await adminController.getEmployeeById(req, res);

      expect(res.statusCode).toBe(500);
    });
  });

  describe('updateEmployee', () => {
    const validUpdate = {
      username: 'valid_user',
      email: 'valid@example.com',
      idNumber: 'ID12345',
      accountNumber: '12345678',
      password: 'newPassword'
    };

    it('should update employee and return updated data with status 200', async () => {
      db.executeQuery
        .mockResolvedValueOnce({ recordset: [{ id: 1 }] }) // check existence
        .mockResolvedValueOnce({ recordset: [{ id: 1, ...validUpdate }] }); // return updated

      passwordUtils.hashPassword.mockResolvedValue('hashedPassword');

      const req = httpMocks.createRequest({
        params: { id: '1' },
        body: validUpdate
      });
      const res = httpMocks.createResponse();

      await adminController.updateEmployee(req, res);

      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().data.employee.username).toBe('valid_user');
      expect(passwordUtils.hashPassword).toHaveBeenCalled();
    });

    it('should return 400 for invalid username format', async () => {
      db.executeQuery.mockResolvedValueOnce({ recordset: [{ id: 1 }] }); // user check

      const req = httpMocks.createRequest({
        params: { id: '1' },
        body: { username: 'in' }
      });
      const res = httpMocks.createResponse();

      await adminController.updateEmployee(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData().message).toContain('username');
    });

    it('should return 400 for invalid email format', async () => {
      db.executeQuery.mockResolvedValueOnce({ recordset: [{ id: 1 }] });

      const req = httpMocks.createRequest({
        params: { id: '1' },
        body: { email: 'invalid-email' }
      });
      const res = httpMocks.createResponse();

      await adminController.updateEmployee(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData().message).toContain('email');
    });

    it('should return 404 when updating non-existent employee', async () => {
      db.executeQuery.mockResolvedValue({ recordset: [] });

      const req = httpMocks.createRequest({
        params: { id: '999' },
        body: validUpdate
      });
      const res = httpMocks.createResponse();

      await adminController.updateEmployee(req, res);

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 when no valid fields are provided', async () => {
      db.executeQuery.mockResolvedValueOnce({ recordset: [{ id: 1 }] });

      const req = httpMocks.createRequest({
        params: { id: '1' },
        body: { foo: 'bar' }
      });
      const res = httpMocks.createResponse();

      await adminController.updateEmployee(req, res);

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData().message).toContain('No valid fields');
    });

    it('should handle password hashing errors with status 500', async () => {
      db.executeQuery.mockResolvedValueOnce({ recordset: [{ id: 1 }] });

      passwordUtils.hashPassword.mockRejectedValue(new Error('Hashing error'));

      const req = httpMocks.createRequest({
        params: { id: '1' },
        body: { password: 'newPass' }
      });
      const res = httpMocks.createResponse();

      await adminController.updateEmployee(req, res);

      expect(res.statusCode).toBe(500);
    });
  });

  describe('deleteEmployee', () => {
    it('should delete employee and return 204', async () => {
      db.executeQuery
        .mockResolvedValueOnce({ recordset: [{ id: 1, role: 'employee' }] })
        .mockResolvedValueOnce({});

      const req = httpMocks.createRequest({ params: { id: '1' } });
      const res = httpMocks.createResponse();

      await adminController.deleteEmployee(req, res);

      expect(res.statusCode).toBe(204);
    });

    it('should return 400 for invalid ID format', async () => {
      const req = httpMocks.createRequest({ params: { id: 'bad-id' } });
      const res = httpMocks.createResponse();

      await adminController.deleteEmployee(req, res);

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 when deleting non-existent employee', async () => {
      db.executeQuery.mockResolvedValue({ recordset: [] });

      const req = httpMocks.createRequest({ params: { id: '999' } });
      const res = httpMocks.createResponse();

      await adminController.deleteEmployee(req, res);

      expect(res.statusCode).toBe(404);
    });

    it('should return 403 when trying to delete admin', async () => {
      db.executeQuery.mockResolvedValue({ recordset: [{ id: 1, role: 'admin' }] });

      const req = httpMocks.createRequest({ params: { id: '1' } });
      const res = httpMocks.createResponse();

      await adminController.deleteEmployee(req, res);

      expect(res.statusCode).toBe(403);
      expect(res._getJSONData().message).toContain('Admin');
    });

    it('should handle database errors with status 500', async () => {
      db.executeQuery.mockRejectedValue(new Error('DB Error'));

      const req = httpMocks.createRequest({ params: { id: '1' } });
      const res = httpMocks.createResponse();

      await adminController.deleteEmployee(req, res);

      expect(res.statusCode).toBe(500);
    });
  });
});
