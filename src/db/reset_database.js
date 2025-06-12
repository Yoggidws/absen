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
})

const resetDatabase = async () => {
  try {
    console.log("Testing database connection...")
    await db.raw("SELECT 1")
    console.log("Database connection successful.")

    console.log("WARNING: This will completely reset the database!")
    console.log("Dropping all tables and types...")

    // Drop all tables in the correct order (reverse of creation)
    const tables = [
      "user_roles",
      "role_permissions", 
      "roles",
      "permissions",
      "payroll_items",
      "payroll_periods",
      "leave_balance_audit",
      "leave_balance",
      "leave_approval_workflow",
      "leave_requests",
      "offboarding_tasks",
      "onboarding_tasks",
      "compensation",
      "employees",
      "reports",
      "announcements",
      "documents",
      "attendance",
      "departments",
      "users",
      "knex_migrations_lock",
      "knex_migrations"
    ]

    for (const table of tables) {
      try {
        await db.schema.dropTableIfExists(table)
        console.log(`Dropped table: ${table}`)
      } catch (error) {
        console.log(`Table ${table} doesn't exist or couldn't be dropped`)
      }
    }

    // Drop all enum types
    const enumTypes = [
      "payroll_item_status",
      "payroll_period_status", 
      "approval_status_type",
      "leave_status_type",
      "leave_type",
      "task_status_type",
      "employment_status_type",
      "marital_status_type",
      "gender_type",
      "report_format_type",
      "report_type",
      "attendance_status_type",
      "attendance_type",
      "user_role_type"
    ]

    for (const enumType of enumTypes) {
      try {
        await db.raw(`DROP TYPE IF EXISTS ${enumType} CASCADE`)
        console.log(`Dropped enum type: ${enumType}`)
      } catch (error) {
        console.log(`Enum type ${enumType} doesn't exist or couldn't be dropped`)
      }
    }

    console.log("Database reset complete. All tables and types have been dropped.")
    console.log("You can now run migrations fresh with: node backend/src/db/migrate.js latest")
    
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
resetDatabase() 