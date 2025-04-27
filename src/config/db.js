require("dotenv").config()
const knex = require("knex")
const path = require("path")

// Initialize knex with PostgreSQL configuration
const db = knex({
  client: "pg",
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
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
    await db.raw("SELECT 1")
    console.log("PostgreSQL Connected")
    return true
  } catch (error) {
    console.error(`Error connecting to PostgreSQL: ${error.message}`)
    return false
  }
}

module.exports = { db, testConnection }
