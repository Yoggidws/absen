require("dotenv").config()
const knex = require("knex")
const path = require("path")

// Initialize knex with PostgreSQL configuration
const db = knex({
  client: "pg",
  connection: {
    host: process.env.DB_HOST ,
    port: process.env.DB_PORT ,
    user: process.env.DB_USER ,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    // Set timezone to UTC for consistent timestamp handling
    timezone: "UTC",
    // Set application_name for better identification in PostgreSQL logs
    application_name: "attendance_system",
    // Add query timeout to prevent hanging connections
    query_timeout: 30000, // 30 seconds
    connectionTimeoutMillis: 10000, // 10 seconds to establish connection
  },
  pool: {
    min: 2, // Keep minimum connections alive
    max: 20, // Increase max connections significantly for better concurrency
    // Connection management timeouts - reduced for faster response
    idleTimeoutMillis: 30000, // Keep connections alive longer
    acquireTimeoutMillis: 10000, // Reduce timeout for acquiring connections to 10s
    // Verify connection before use to avoid stale connections
    afterCreate: (conn, done) => {
      conn.query("SELECT 1", (err) => {
        if (err) {
          // Connection is bad, remove it from the pool
          console.error("Connection verification failed:", err.message);
          done(err, conn);
        } else {
          // Connection is good, set session parameters
          conn.query('SET timezone="UTC";', (tzErr) => {
            if (tzErr) {
              console.error("Failed to set timezone:", tzErr.message);
            }
            done(tzErr, conn);
          });
        }
      });
    },
    // Connection lifecycle management - more aggressive cleanup
    reapIntervalMillis: 30000, // Check for old connections every 30 seconds
    createTimeoutMillis: 10000, // Reduce timeout when creating a new connection
    createRetryIntervalMillis: 1000, // Wait 1 second before retrying to create a connection
    // Additional pool options for better stability
    propagateCreateError: false, // Don't propagate connection creation errors immediately
    // Add destroy timeout to prevent hanging during pool destruction
    destroyTimeoutMillis: 5000,
  },
  migrations: {
    tableName: "knex_migrations",
    directory: path.join(__dirname, "../db/migrations"),
  },
  seeds: {
    directory: path.join(__dirname, "../db/seeds"),
  },
  // Debug SQL queries in development
  debug: process.env.NODE_ENV === "development",
  // Better error handling
  asyncStackTraces: process.env.NODE_ENV === "development",
  // Optimize query performance
  postProcessResponse: (result, queryContext) => {
    // Add query timing in development
    if (process.env.NODE_ENV === "development" && queryContext && queryContext.startTime) {
      const duration = Date.now() - queryContext.startTime;
      if (duration > 1000) { // Log slow queries
        console.warn(`Slow query detected: ${duration}ms - ${queryContext.sql}`);
      }
    }
    return result;
  },
  wrapIdentifier: (value, origImpl) => origImpl(value),
})

// Add connection event listeners for better debugging
db.on('query', (query) => {
  if (process.env.NODE_ENV === 'development') {
    query.startTime = Date.now();
    console.log('SQL Query:', query.sql.substring(0, 100) + (query.sql.length > 100 ? '...' : ''));
  }
});

db.on('query-response', (response, query) => {
  if (process.env.NODE_ENV === 'development' && query && query.startTime) {
    const duration = Date.now() - query.startTime;
    if (duration > 500) { // Log queries taking more than 500ms
      console.warn(`Query completed in ${duration}ms:`, query.sql.substring(0, 100));
    }
  }
});

db.on('query-error', (error, query) => {
  console.error('SQL Query Error:', error.message);
  console.error('Failed Query:', query.sql);
});

// Test database connection
const testConnection = async () => {
  try {
    // Log connection details (without password) for debugging
    console.log("Attempting to connect to PostgreSQL with:", {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === "true" ? "enabled" : "disabled",
      environment: process.env.NODE_ENV,
      vercel: process.env.VERCEL ? "true" : "false",
      pool: {
        min: 2,
        max: 20 // Updated max
      }
    });

    // Add timeout to the test query
    await Promise.race([
      db.raw("SELECT 1"),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection test timeout')), 5000)
      )
    ]);
    
    console.log("PostgreSQL Connected Successfully")
    
    // Log initial pool status
    const poolStatus = getPoolStatus();
    console.log("Initial pool status:", poolStatus);
    
    return true
  } catch (error) {
    console.error(`Error connecting to PostgreSQL: ${error.message}`)
    console.error(`Stack trace: ${error.stack}`)

    // Check for common connection issues
    if (error.message.includes('ECONNREFUSED')) {
      console.error('Connection refused. Please check if the database server is running and accessible.');
    } else if (error.message.includes('password authentication failed')) {
      console.error('Authentication failed. Please check your database username and password.');
    } else if (error.message.includes('does not exist')) {
      console.error('Database does not exist. Please check your database name.');
    } else if (error.message.includes('SSL')) {
      console.error('SSL error. Please check your SSL configuration.');
    } else if (error.message.includes('timeout') || error.message.includes('pool')) {
      console.error('Connection pool error. The database might be overloaded or the pool settings need adjustment.');
    }

    return false
  }
}

// Function to explicitly destroy all connections in the pool
const destroyConnectionPool = async () => {
  try {
    console.log("Destroying database connection pool...");
    const poolStatus = getPoolStatus();
    console.log("Pool status before destroy:", poolStatus);
    
    // Add timeout to pool destruction
    await Promise.race([
      db.destroy(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Pool destruction timeout')), 5000)
      )
    ]);
    
    console.log("Database connection pool destroyed successfully");
    return true;
  } catch (error) {
    console.error(`Error destroying database connection pool: ${error.message}`);
    return false;
  }
};

// Function to get current pool status
const getPoolStatus = () => {
  try {
    const pool = db.client.pool;
    return {
      size: pool.numUsed() + pool.numFree(),
      used: pool.numUsed(),
      free: pool.numFree(),
      pending: pool.numPendingAcquires(),
      waiting: pool.numPendingCreates ? pool.numPendingCreates() : 0,
      max: pool.max,
      min: pool.min,
    };
  } catch (error) {
    console.error(`Error getting pool status: ${error.message}`);
    return { error: error.message };
  }
};

// Function to reset pool connections (useful for debugging)
const resetPool = async () => {
  try {
    console.log("Resetting database pool...");
    const beforeStatus = getPoolStatus();
    console.log("Pool status before reset:", beforeStatus);
    
    // Destroy and recreate the pool with timeout
    await Promise.race([
      db.destroy(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Pool reset timeout')), 5000)
      )
    ]);
    
    // Wait a moment before reconnecting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test the new connection
    await testConnection();
    
    const afterStatus = getPoolStatus();
    console.log("Pool status after reset:", afterStatus);
    
    return true;
  } catch (error) {
    console.error(`Error resetting pool: ${error.message}`);
    return false;
  }
};

module.exports = { db, testConnection, destroyConnectionPool, getPoolStatus, resetPool }
