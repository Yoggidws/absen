const knex = require("knex")
const path = require("path")
const dotenv = require("dotenv")
const fs = require("fs")

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../../.env") })

// Validate required environment variables
const requiredEnvVars = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASS", "DB_NAME"]
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName])

if (missingEnvVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingEnvVars.join(", ")}`)
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
  seeds: {
    directory: path.join(__dirname, "seeds"),
  },
  // Log queries in verbose mode
  debug: process.argv.includes("--verbose"),
})

// Command line arguments
const args = process.argv.slice(2)
const command = args[0] || "latest" // Default to latest

// Run migrations
const migrate = async () => {
  try {
    console.log("Testing database connection...")
    await db.raw("SELECT 1")
    console.log("Database connection successful.")

    switch (command) {
      case "latest":
        console.log("Running migrations to latest version...")
        const [batchNo, log] = await db.migrate.latest()
        if (log.length === 0) {
          console.log("Database already up to date.")
        } else {
          console.log(`Batch ${batchNo} run: ${log.length} migrations applied.`)
          log.forEach((file) => console.log(`- ${file}`))
        }
        break

      case "rollback":
        console.log("Rolling back the last batch of migrations...")
        const [batchNoRollback, logRollback] = await db.migrate.rollback()
        if (logRollback.length === 0) {
          console.log("No migrations to rollback.")
        } else {
          console.log(`Batch ${batchNoRollback} rolled back: ${logRollback.length} migrations.`)
          logRollback.forEach((file) => console.log(`- ${file}`))
        }
        break

      case "seed":
        console.log("Running seed files...")
        await db.seed.run()
        console.log("Seed files executed successfully.")
        break

      case "status":
        const [completed, pending] = await db.migrate.status()
        console.log("Migration Status:")
        console.log(`- Completed migrations: ${completed.length}`)
        console.log(`- Pending migrations: ${pending.length}`)

        if (completed.length > 0) {
          console.log("\nCompleted Migrations:")
          completed.forEach((file) => console.log(`- ${file}`))
        }

        if (pending.length > 0) {
          console.log("\nPending Migrations:")
          pending.forEach((file) => console.log(`- ${file}`))
        }
        break

      default:
        console.error(`Unknown command: ${command}`)
        console.log("Available commands: latest, rollback, seed, status")
        process.exit(1)
    }

    console.log("Operation completed successfully.")
    process.exit(0)
  } catch (error) {
    console.error("Migration failed:", error)
    process.exit(1)
  } finally {
    // Close the database connection
    await db.destroy()
  }
}

// Execute the migration command
migrate()
