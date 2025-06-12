const knex = require("knex")
const path = require("path")
const dotenv = require("dotenv")

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../../.env") })

// Validate required environment variables
const requiredEnvVars = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASS", "DB_NAME"]
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName])

if (missingEnvVars.length > 0) {
  console.error(`FATAL ERROR: Missing required environment variables: ${missingEnvVars.join(", ")}`)
  process.exit(1)
}

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
    timezone: "UTC",
  },
  migrations: {
    tableName: "knex_migrations",
    directory: path.join(__dirname, "migrations"),
  },
})

const resetMigrations = async () => {
  try {
    console.log("Testing database connection...")
    await db.raw("SELECT 1")
    console.log("Database connection successful.")

    // Check if knex_migrations table exists
    const tableExists = await db.schema.hasTable("knex_migrations")
    
    if (tableExists) {
      console.log("Clearing migration history...")
      await db("knex_migrations").del()
      console.log("Migration history cleared successfully.")
    } else {
      console.log("No migration table found. This is a fresh database.")
    }

    // Check if knex_migrations_lock table exists and clear it too
    const lockTableExists = await db.schema.hasTable("knex_migrations_lock")
    if (lockTableExists) {
      await db("knex_migrations_lock").del()
      console.log("Migration lock table cleared.")
    }

    console.log("Migration state reset complete. You can now run migrations fresh.")
    process.exit(0)
  } catch (error) {
    console.error("Reset operation failed:", error)
    process.exit(1)
  } finally {
    // Close the database connection
    if (db) {
      await db.destroy()
    }
  }
}

// Execute the reset
resetMigrations() 