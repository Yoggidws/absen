require("dotenv").config()
const knex = require("knex")
const path = require("path")

// Initialize knex with PostgreSQL configuration
const db = knex({
  client: "pg",
  connection: {
    host: process.env.DB_HOST || 'absensi-yoggisaputraaa-b9c8.h.aivencloud.com',
    port: process.env.DB_PORT || 22319,
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASS || 'AVNS_SYL3I2ooLTCRimcJmNy',
    database: process.env.DB_NAME || 'absensi',
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    // Set timezone to UTC for consistent timestamp handling
    timezone: "UTC",
    // Set application_name for better identification in PostgreSQL logs
    application_name: "attendance_system",
  },
  pool: {
    min: 1,
    max: 10,
    // Important for serverless: destroy idle connections
    idleTimeoutMillis: 30000,
    // Important for serverless: acquire timeout
    acquireTimeoutMillis: 30000,
    // Verify connection before use to avoid stale connections
    afterCreate: (conn, done) => {
      conn.query("SELECT 1", (err) => {
        if (err) {
          // Connection is bad, remove it from the pool
          done(err, conn)
        } else {
          // Connection is good, set session parameters
          conn.query('SET timezone="UTC";', (tzErr) => {
            done(tzErr, conn)
          })
        }
      })
    },
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

module.exports = { db, testConnection }
