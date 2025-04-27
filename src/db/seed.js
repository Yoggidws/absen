const knex = require("knex")
const path = require("path")
const dotenv = require("dotenv")

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
  seeds: {
    directory: path.join(__dirname, "seeds"),
  },
  // Log queries in verbose mode
  debug: process.argv.includes("--verbose"),
})

// Command line arguments
const args = process.argv.slice(2)
const specificSeed = args[0] // Optional specific seed file to run

// Run seeds
const seed = async () => {
  try {
    console.log("Testing database connection...")
    await db.raw("SELECT 1")
    console.log("Database connection successful.")

    if (specificSeed) {
      console.log(`Running specific seed file: ${specificSeed}...`)
      await db.seed.run({ specific: specificSeed })
      console.log(`Seed file ${specificSeed} executed successfully.`)
    } else {
      console.log("Running all seed files...")
      await db.seed.run()
      console.log("All seed files executed successfully.")
    }

    process.exit(0)
  } catch (error) {
    console.error("Seeding failed:", error)
    process.exit(1)
  } finally {
    // Close the database connection
    await db.destroy()
  }
}

// Execute the seed command
seed()
