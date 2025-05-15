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
  },
  pool: {
    min: 0, // Start with 0 connections
    max: 3, // Reduce max connections to avoid hitting limits
    // Reduce idle timeout to release connections faster
    idleTimeoutMillis: 10000,
    // Reduce acquire timeout
    acquireTimeoutMillis: 15000,
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
    // Force close connections after they've been in the pool for too long
    reapIntervalMillis: 30000, // Check for old connections every 30 seconds
    createTimeoutMillis: 10000, // Timeout when creating a new connection
    // Destroy connections that have been idle for too long
    createRetryIntervalMillis: 2000, // Wait 2 seconds before retrying to create a connection
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
})

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
      vercel: process.env.VERCEL ? "true" : "false"
    });

    await db.raw("SELECT 1")
    console.log("PostgreSQL Connected Successfully")
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
    }

    return false
  }
}

// Function to explicitly destroy all connections in the pool
const destroyConnectionPool = async () => {
  try {
    console.log("Destroying database connection pool...");
    await db.destroy();
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
      max: pool.max,
    };
  } catch (error) {
    console.error(`Error getting pool status: ${error.message}`);
    return { error: error.message };
  }
};

module.exports = { db, testConnection, destroyConnectionPool, getPoolStatus }
