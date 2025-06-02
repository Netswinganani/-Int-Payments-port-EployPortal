const sql = require('mssql');

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: false, // Adjust if you have a trusted cert
  },
};

let pool = null;
let isConnecting = false;
let reconnectTimeout = null;

async function connectToDb() {
  if (pool) {
    return pool;
  }
  if (isConnecting) {
    // Wait for existing connection attempt to finish
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (pool) {
          clearInterval(interval);
          resolve(pool);
        }
      }, 100);
      // Optional: add timeout to reject if takes too long
      setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Timeout while waiting for DB connection'));
      }, 10000);
    });
  }

  isConnecting = true;
  try {
    pool = await sql.connect(dbConfig);
pool.on('acquire', () => {
  console.log('Connection acquired');
});
pool.on('release', () => {
  console.log('Connection released');
});
    // Attach error listener to reset pool on fatal errors
    pool.on('error', err => {
      console.error('DB Pool error:', err);
      pool = null;
      scheduleReconnect();
    });

    console.log('✅ Database connection established');
    return pool;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    pool = null;
    scheduleReconnect();
    throw err;
  } finally {
    isConnecting = false;
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  reconnectTimeout =setTimeout(() => {
  reconnectTimeout = null;
  console.log('🔁 Attempting to reconnect to the database...');
  connectToDb().catch(err => {
    console.error('Reconnect attempt failed:', err.message);
    scheduleReconnect(); // <- potentially endless loop
  });
  }, 5000);
}

// Execute a query with parameterized inputs
async function executeQuery(query, params = {}) {
  try {
    const dbPool = await connectToDb();
    const request = dbPool.request();

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'number') {
        request.input(key, sql.Int, value);
      } else if (value instanceof Date) {
        request.input(key, sql.DateTime, value);
      } else if (typeof value === 'boolean') {
        request.input(key, sql.Bit, value);
      } else {
        request.input(key, sql.NVarChar, value?.toString() ?? '');
      }
    }

    const result = await request.query(query);
    return result;
  } catch (error) {
    console.error('Query execution error:', error);

    if (error.code === 'ECONNRESET' || error.code === 'ETIMEOUT' || error.code === 'EINVALIDSTATE') {
      pool = null; // ✅ resets the actual global pool
      await connectToDb();
      return executeQuery(query, params);
    }

    throw error;
  }
}


// Transaction helper
async function withTransaction(callback) {
  const pool = await connectToDb();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const trxRequest = transaction.request();

    // Helper for parameterized queries within transaction
    const trxQuery = async (query, params = {}) => {
      const req = transaction.request();
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'number') {
          req.input(key, sql.Int, value);
        } else if (value instanceof Date) {
          req.input(key, sql.DateTime, value);
        } else if (typeof value === 'boolean') {
          req.input(key, sql.Bit, value);
        } else {
          req.input(key, sql.NVarChar, value?.toString() ?? '');
        }
      }
      return await req.query(query);
    };

    await callback(trxRequest, trxQuery);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  connectToDb,
  executeQuery,
  withTransaction,
  sql,
};
