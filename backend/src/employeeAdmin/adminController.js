// backend/src/employeeAdmin/adminController.js
const { executeQuery } = require('../config/db');
const { hashPassword } = require('../employeeAuth/passwordUtils');

/**
 * Get all employees in the system
 */
exports.getAllEmployees = async (req, res) => {
  try {
    // Extract query parameters for pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    // Query to get paginated list of employees
    const query = `
      SELECT id, username, email, idNumber, accountNumber, balance, role,  createdAt, updatedAt
      FROM Users
      WHERE role = 'employee'
      ORDER BY username
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    // Query to get total count for pagination
    const countQuery = `
      SELECT COUNT(*) AS totalCount
      FROM Users
      WHERE role = 'employee'
    `;

    // Execute queries
    const result = await executeQuery(query, { offset, limit });
    const countResult = await executeQuery(countQuery);
    const totalCount = countResult.recordset[0].totalCount;

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      status: 'success',
      results: result.recordset.length,
      data: {
        employees: result.recordset
      },
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching employees'
    });
  }
};

/**
 * Get a specific employee by ID
 */
exports.getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate employee ID
    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid employee ID'
      });
    }

    // Execute query
    const result = await executeQuery(`
      SELECT id, username, email, idNumber, accountNumber, balance, role,  createdAt, updatedAt
      FROM Users
      WHERE id = @id AND role = 'employee'
    `, {
      id: parseInt(id, 10)
    });

    // Check if employee exists
    if (result.recordset.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'Employee not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        employee: result.recordset[0]
      }
    });
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching the employee'
    });
  }
};

/**
 * Update an employee's information
 */exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate employee ID early
    const parsedId = parseInt(id, 10);
    if (!parsedId) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid employee ID'
      });
    }

    const { username, email, idNumber, accountNumber, role, password } = req.body;

    // Find employee using parsedId
   
    // Input format validations
    if (username) {
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid username format'
        });
      }
    }

    if (email) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid email format'
        });
      }
    }

    if (idNumber) {
      const idNumberRegex = /^[A-Z0-9]{5,15}$/;
      if (!idNumberRegex.test(idNumber)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid ID number format'
        });
      }
    }

    if (accountNumber) {
      const accountNumberRegex = /^[0-9]{8,20}$/;
      if (!accountNumberRegex.test(accountNumber)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid account number format'
        });
      }
    }

    if (role && !['employee', 'admin'].includes(role)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid role value'
      });
    }

    // Prepare dynamic update fields
    const queryParams = { id: parsedId };
    const updateFields = [];

    if (username) {
      updateFields.push('username = @username');
      queryParams.username = username;
    }

    if (email) {
      updateFields.push('email = @email');
      queryParams.email = email;
    }

    if (idNumber) {
      updateFields.push('idNumber = @idNumber');
      queryParams.idNumber = idNumber;
    }

    if (accountNumber) {
      updateFields.push('accountNumber = @accountNumber');
      queryParams.accountNumber = accountNumber;
    }

    if (role) {
      updateFields.push('role = @role');
      queryParams.role = role;
    }

    if (password) {
      try {
        const hashedPassword = await hashPassword(password);
        updateFields.push('password = @password');
        queryParams.password = hashedPassword;
      } catch (err) {
        return res.status(500).json({
          status: 'error',
          message: 'Password hashing failed'
        });
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'No valid fields provided for update'
      });
    }

    // Double-check if employee exists and is employee role
    const checkResult = await executeQuery(
      `SELECT id FROM Users WHERE id = @id AND role = 'employee'`,
      { id: parsedId }
    );

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'Employee not found'
      });
    }

    // Append update timestamp
    updateFields.push('updatedAt = GETDATE()');

    // Final update query
    const updateQuery = `
      UPDATE Users
      SET ${updateFields.join(', ')}
      WHERE id = @id;

      SELECT id, username, email, idNumber, accountNumber, balance, role, updatedAt
      FROM Users
      WHERE id = @id;
    `;

    const result = await executeQuery(updateQuery, queryParams);

    res.status(200).json({
      status: 'success',
      data: {
        employee: result.recordset[0]
      }
    });

  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while updating the employee'
    });
  }
};

/**
 * Delete an employee from the system
 */
exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate employee ID
    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid employee ID'
      });
    }

    // Check if employee exists and is not an admin
    const checkResult = await executeQuery(`
      SELECT id, role FROM Users WHERE id = @id
    `, {
      id: parseInt(id, 10)
    });

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'Employee not found'
      });
    }

    // Cannot delete admin users through this endpoint for safety
    if (checkResult.recordset[0].role === 'admin') {
      return res.status(403).json({
        status: 'fail',
        message: 'Admin users cannot be deleted through this endpoint'
      });
    }

    // Delete the employee
    await executeQuery(`
      DELETE FROM Users
      WHERE id = @id AND role = 'employee'
    `, {
      id: parseInt(id, 10)
    });

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while deleting the employee'
    });
  }
};