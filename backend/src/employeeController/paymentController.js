const { decryptData } = require('../utils/encryption');
const { executeQuery } = require('../config/db');
const { withTransaction } = require('../config/db');

/**
 * Process a single payment (by an employee)
 */exports.processPayment = async (req, res) => {
  const paymentId = parseInt(req.params.id, 10);
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ status: 'fail', message: 'Unauthorized: user info missing' });
  }

  if (isNaN(paymentId)) {
    return res.status(400).json({ status: 'fail', message: 'Invalid payment ID' });
  }

  try {
    // Retrieve payment
    const paymentResult = await executeQuery(`
      SELECT * FROM Payments WHERE id = @paymentId
    `, { paymentId });

    if (paymentResult.recordset.length === 0) {
      return res.status(404).json({ status: 'fail', message: 'Payment not found' });
    }

    const payment = paymentResult.recordset[0];

    if (payment.status !== 'pending') {
      return res.status(400).json({ status: 'fail', message: 'Only pending payments can be processed' });
    }

    // Find the real recipient based on decrypted recipientAccount
    const usersResult = await executeQuery(`
      SELECT id, accountNumber FROM Users
    `);

    let recipientId = null;
    for (const user of usersResult.recordset) {
      try {
        const decrypted = decryptData(user.accountNumber);
        if (decrypted === payment.recipientAccount) {
          recipientId = user.id;
          break;
        }
      } catch (err) {
        console.warn(`Decryption failed for user ID ${user.id}`);
      }
    }

    if (!recipientId) {
      return res.status(404).json({ status: 'fail', message: 'Recipient not found by account number' });
    }

    // Insert into payment_history
    await executeQuery(`
      INSERT INTO payment_history (
        original_payment_id, recipient_id, amount, currency, payment_mode, reference,
        swift_code, provider, status, is_instant, fee, transaction_date, processed_date,
        processed_by_employee_id, recipientName, recipientAccount, bankName,
        payment_method, userId, created_at, updated_at
      ) VALUES (
        @id, @recipientId, @amount, @currency, @paymentMode, @reference,
        @swiftCode, @provider, 'processed', @isInstant, @fee, @transactionDate, GETDATE(),
        @processedBy, @recipientName, @recipientAccount, @bankName,
        @paymentMethod, @userId, @createdAt, @updatedAt
      )
    `, {
      id: payment.id,
      recipientId,
      amount: payment.amount,
      currency: payment.currency,
      paymentMode: payment.payment_mode,
      reference: payment.reference,
      swiftCode: payment.swift_code,
      provider: payment.provider || null,
      isInstant: payment.is_instant,
      fee: payment.fee,
      transactionDate: payment.transaction_date,
      processedBy: userId,
      recipientName: payment.recipientName,
      recipientAccount: payment.recipientAccount,
      bankName: payment.bankName,
      paymentMethod: payment.payment_method,
      userId: payment.userId,
      createdAt: payment.created_at,
      updatedAt: payment.updated_at
    });

    // Update original payment status
    await executeQuery(`
      UPDATE Payments 
      SET status = 'processed'
      WHERE id = @paymentId
    `, { paymentId });

    // Update recipient balance
    await executeQuery(`
      UPDATE Users 
      SET balance = balance + @amount
      WHERE id = @recipientId
    `, { amount: payment.amount, recipientId });

    return res.json({
      status: 'success',
      message: 'Payment processed successfully',
      data: {
        sender: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          accountNumber: req.user.accountNumber || null
        },
        payment: {
          id: payment.id,
          recipientName: payment.recipientName,
          recipientAccount: payment.recipientAccount,
          amount: payment.amount,
          currency: payment.currency
        }
      }
    });

  } catch (error) {
    console.error('Error processing payment:', error);
    return res.status(500).json({ status: 'error', message: 'Server error processing payment' });
  }
};


/**
 * Get all pending (or filtered) payments for employee dashboard
 */
exports.getPayments = async (req, res) => {
  console.log('getPayments called with query:', req.query);
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const { startDate, endDate, status } = req.query;

    const queryParams = {
      offset,
      limit
    };

    let query = `
  SELECT 
    p.id, p.userId, p.amount, p.currency, p.payment_mode,
    p.reference, p.swift_code, p.status, p.is_instant,
    p.transaction_date, p.created_at, p.updated_at,
    p.recipientName, p.recipientAccount, p.bankName,
    p.payment_method, p.fee
  FROM Payments p
  WHERE 1 = 1
`;

    if (startDate) {
      query += ` AND p.transaction_date >= @startDate`;
      queryParams.startDate = new Date(startDate);
    }

    if (endDate) {
      query += ` AND p.transaction_date <= @endDate`;
      queryParams.endDate = new Date(endDate);
    }

    if (status) {
      query += ` AND p.status = @status`;
      queryParams.status = status;
    } else {
      query += ` AND p.status = 'pending'`; // default
    }

    query += `
      ORDER BY p.transaction_date DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const result = await executeQuery(query, queryParams);

    // Count query
    let countQuery = `
      SELECT COUNT(*) AS totalCount FROM Payments p WHERE 1=1
    `;

    if (startDate) countQuery += ` AND p.transaction_date >= @startDate`;
    if (endDate) countQuery += ` AND p.transaction_date <= @endDate`;
    if (status) countQuery += ` AND p.status = @status`;
    else countQuery += ` AND p.status = 'pending'`;

    const countResult = await executeQuery(countQuery, queryParams);
    const totalCount = countResult.recordset[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      status: 'success',
      results: result.recordset.length,
      data: {
        payments: result.recordset
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
    console.error('Error fetching payments:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching payments'
    });
  }
};


/**
 * Get payments processed by this employee (from payment_history)
 */
exports.getProcessedPayments = async (req, res) => {
  const employeeId = req.user.id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  const { startDate, endDate } = req.query;
  const queryParams = { employeeId };

  try {
    let query = `
      SELECT 
        ph.id, ph.original_payment_id, ph.amount, ph.currency, ph.recipientName, ph.recipientAccount,
        ph.bankName, ph.status, ph.fee, ph.payment_method, ph.transaction_date, ph.processed_date
      FROM payment_history ph
      WHERE ph.processed_by_employee_id = @employeeId
    `;

    let countQuery = `
      SELECT COUNT(*) AS totalCount
      FROM payment_history ph
      WHERE ph.processed_by_employee_id = @employeeId
    `;

    if (startDate) {
      query += ` AND ph.processed_date >= @startDate`;
      countQuery += ` AND ph.processed_date >= @startDate`;
      queryParams.startDate = new Date(startDate);
    }

    if (endDate) {
      query += ` AND ph.processed_date <= @endDate`;
      countQuery += ` AND ph.processed_date <= @endDate`;
      queryParams.endDate = new Date(endDate);
    }

    query += ` ORDER BY ph.processed_date DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    queryParams.offset = offset;
    queryParams.limit = limit;

    const result = await executeQuery(query, queryParams);
    const countResult = await executeQuery(countQuery, queryParams);
    const totalCount = countResult.recordset[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      status: 'success',
      results: result.recordset.length,
      data: {
        paymentHistory: result.recordset
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
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching payment history'
    });
  }
};
/**
 * 
 * * Get payment history for a user (for employee dashboard)
 * * Get payment history for a user (for employee dashboard)
 * * Get payment history for a user (for employee dashboard)
 */
exports.getPaymentHistory = async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { startDate, endDate, status } = req.query;

  const params = {
    userId,
    offset,
    limit,
  };

  let whereClause = 'WHERE processed_by_employee_id = @userId';

  if (startDate) {
    whereClause += ' AND transaction_date >= @startDate';
    params.startDate = startDate;
  }

  if (endDate) {
    whereClause += ' AND transaction_date <= @endDate';
    params.endDate = endDate;
  }

  if (status) {
    whereClause += ' AND status = @status';
    params.status = status;
  }

  try {
    const payments = await executeQuery(`
      SELECT * FROM payment_history
      ${whereClause}
      ORDER BY transaction_date DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `, params);

    const count = await executeQuery(`
      SELECT COUNT(*) AS total FROM payment_history
      ${whereClause}
    `, params);

    const total = count.recordset[0].total;
    const totalPages = Math.ceil(total / limit);

    return res.json({
      status: 'success',
      data: { payments: payments.recordset },
      pagination: { totalPages }
    });
  } catch (err) {
    console.error('Error fetching payment history:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to load payment history' });
  }
};

exports.getAllCustomers = async (req, res, next) => {
  try {
    const query = 'SELECT * FROM Users WHERE role = @role';
    const queryParams = { role: 'customer' };

    console.log('Executing SQL:', query);
    console.log('With Params:', queryParams);

    const result = await executeQuery(query, queryParams);

    // Decrypt sensitive fields
    const users = result.recordset.map(user => {
      let decryptedAccountNumber = '';
      let decryptedIdNumber = '';

      try {
        decryptedAccountNumber = decryptData(user.accountNumber);
        decryptedIdNumber = decryptData(user.idNumber);
      } catch (e) {
        console.warn(`Decryption failed for user ID ${user.id}`, e);
      }

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        accountNumber: decryptedAccountNumber,
        idNumber: decryptedIdNumber,
        balance: user.balance,
        role: user.role
      };
    });

    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        customers: users
      }
    });
  } catch (err) {
    console.error('getAllCustomers error:', err);
    next(err);
  }
};/**
 * Cancel a single payment (by an Users(role customer))
 * This will refund the user and log the cancellation in payment_history
 * The employee who processed is a Users(role employee)
 */
exports.cancelPayment = async (req, res) => {
  const paymentId = parseInt(req.params.id, 10);
  const employeeId = req.user.id;
  const reason = req.body.reason || 'Cancelled by system';

  if (!employeeId) {
    return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
  }

  if (isNaN(paymentId)) {
    return res.status(400).json({ status: 'fail', message: 'Invalid payment ID' });
  }

  try {
    await withTransaction(async (trxRequest, trxQuery) => {
      const now = new Date();

      // Lock and fetch the payment
      const paymentResult = await trxQuery(`
        SELECT * FROM Payments 
        WITH (UPDLOCK, ROWLOCK)
        WHERE id = @paymentId AND status = 'pending';
      `, { paymentId });

      if (paymentResult.recordset.length === 0) {
        const statusCheck = await trxQuery(`
          SELECT status FROM Payments WHERE id = @paymentId;
        `, { paymentId });

        if (statusCheck.recordset.length === 0) {
          throw new Error('Payment not found');
        } else {
          throw new Error(`Cannot cancel payment with status '${statusCheck.recordset[0].status}'`);
        }
      }

      const payment = paymentResult.recordset[0];

      // Insert a new "cancelled" record into Payments
      await trxQuery(`
        INSERT INTO Payments (
          original_payment_id, recipient_id, amount, currency, payment_mode,
          reference, status, is_instant, fee, transaction_date, processed_date,
          processed_by_employee_id, recipientName, recipientAccount, bankName,
          payment_method, userId, reason
        )
        VALUES (
          @original_payment_id, @recipient_id, @amount, @currency, @payment_mode,
          @reference, 'cancelled', @is_instant, @fee, @transaction_date, @now,
          @employeeId, @recipientName, @recipientAccount, @bankName,
          @payment_method, @userId, @reason
        );
      `, {
        original_payment_id: payment.id,
        recipient_id: payment.recipient_id,
        amount: payment.amount,
        currency: payment.currency,
        payment_mode: payment.payment_mode,
        reference: payment.reference,
        is_instant: payment.is_instant,
        fee: payment.fee,
        transaction_date: payment.transaction_date,
        now,
        employeeId,
        recipientName: payment.recipientName,
        recipientAccount: payment.recipientAccount,
        bankName: payment.bankName,
        payment_method: payment.payment_method,
        userId: payment.userId,
        reason
      });

      // Update original payment status to "cancelled"
      await trxQuery(`
        UPDATE Payments
        SET status = 'cancelled',
            processed_by_employee_id = @employeeId,
            processed_date = @now,
            reason = @reason
        WHERE id = @paymentId;
      `, { now, employeeId, paymentId, reason });

      // Log cancellation in payment_history with original_payment_id included
      await trxQuery(`
        INSERT INTO payment_history (
          original_payment_id, status, processed_by_employee_id, changed_at, reason
        )
        VALUES (
          @paymentId, 'cancelled', @employeeId, @now, @reason
        );
      `, { paymentId, employeeId, now, reason });

      // Update user's balance and reason
      await trxQuery(`
        UPDATE Users
        SET balance = balance + @amount,
            reason = @reason
        WHERE id = @userId;
      `, {
        amount: payment.amount,
        reason,
        userId: payment.userId,
      });

      res.status(200).json({ status: 'success', message: 'Payment cancelled successfully.' });
    });
  } catch (error) {
    console.error('Error cancelling payment:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Internal Server Error' });
  }
};



/**
 * Get a specific payment by ID (for viewing)
 */
exports.getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid payment ID'
      });
    }

    const result = await executeQuery(`
      SELECT 
        p.id, p.amount, p.currency, p.payment_mode,
        p.reference, p.swift_code, p.status, p.is_instant,
        p.transaction_date, p.created_at, p.updated_at,
        p.recipientName, p.recipientAccount, p.bankName,
        p.payment_method, p.fee
      FROM Payments p
      WHERE p.id = @id
    `, {
      id: parseInt(id, 10)
    });

    if (result.recordset.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payment not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        payment: result.recordset[0]
      }
    });
  } catch (error) {
    console.error('Error fetching payment by ID:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching the payment'
    });
  }
};
