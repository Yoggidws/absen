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
  console.error(`FATAL ERROR: Missing required environment variables: ${missingEnvVars.join(", ")}`)
  process.exit(1)
}

console.log("Attempting to initialize Knex for migrations with:");
console.log({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  // Omitting DB_PASS from logs for security
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// Initialize knex with PostgreSQL configuration
let db;
try {
  db = knex({
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
    // More detailed error for pool issues during migration
    pool: {
      min: 0,
      max: 1, // Reduce pool for migration script to avoid exhausting connections
      acquireTimeoutMillis: 60000, // Increase timeout for acquiring connection
      afterCreate: (conn, done) => {
        conn.query('SELECT 1', (err) => {
          if (err) {
            console.error("KNEX POOL: Connection test failed after create:", err);
            done(err, conn);
          } else {
            console.log("KNEX POOL: Connection test successful after create.");
            done(null, conn);
          }
        });
      }
    }
  });
  console.log("Knex initialized for migrations.");
} catch (initError) {
  console.error("FATAL ERROR: Knex initialization failed:", initError);
  process.exit(1);
}

// Command line arguments
const args = process.argv.slice(2)
const command = args[0] || "latest" // Default to latest

// Run migrations
const migrate = async () => {
  try {
    console.log("Testing database connection with db.raw('SELECT 1')...");
    await db.raw("SELECT 1")
    console.log("Database connection successful (db.raw).");

    switch (command) {
      case "latest":
      case "up": // Adding 'up' as an alias for 'latest'
        console.log("Running migrations to latest version...");
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
        try {
          // Simple approach: just query the migrations table directly
          const completedMigrations = await db('knex_migrations').select('name', 'batch').orderBy('batch', 'asc')
          
          console.log("Migration Status:")
          console.log(`- Completed migrations: ${completedMigrations.length}`)
          
          if (completedMigrations.length > 0) {
            console.log("\nCompleted Migrations:")
            completedMigrations.forEach((migration) => console.log(`- ${migration.name} (batch ${migration.batch})`))
          }
          
          // Check for pending migrations by comparing with files in directory
          const fs = require('fs')
          const migrationDir = path.join(__dirname, 'migrations')
          const migrationFiles = fs.readdirSync(migrationDir).filter(file => file.endsWith('.js'))
          const completedNames = completedMigrations.map(m => m.name)
          const pendingFiles = migrationFiles.filter(file => !completedNames.includes(file))
          
          console.log(`- Pending migrations: ${pendingFiles.length}`)
          if (pendingFiles.length > 0) {
            console.log("\nPending Migrations:")
            pendingFiles.forEach((file) => console.log(`- ${file}`))
          }
          
        } catch (statusError) {
          console.error("Error getting migration status:", statusError)
        }
        break

      default:
        console.error(`Unknown command: ${command}`)
        console.log("Available commands: latest (or up), rollback, seed, status")
        process.exit(1)
    }

    console.log("Operation completed successfully.")
    process.exit(0)
  } catch (error) {
    console.error("Migration operation failed:", error);
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);
    console.error("Error Code (PostgreSQL specific, if available):", error.code);
    console.error("Error Stack:", error.stack);
    process.exit(1)
  } finally {
    // Close the database connection
    if (db) {
      console.log("Destroying Knex connection pool for migrations...");
      await db.destroy();
      console.log("Knex connection pool for migrations destroyed.");
    }
  }
}

// Execute the migration command
migrate()
