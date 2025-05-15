const express = require("express")
const cors = require("cors")
const morgan = require("morgan")
const dotenv = require("dotenv")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
const { errorHandler } = require("../middlewares/errorMiddleware")
const vercelCorsMiddleware = require("../middlewares/vercelCorsMiddleware")
const { testConnection, getPoolStatus, destroyConnectionPool } = require("../config/db")

// Load environment variables
dotenv.config()

const port = 5000 // Explicitly use port 5002
console.log(`Using port: ${port}`)
// const serverless = require("serverless-http");

// Configure rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again after 15 minutes"
})


// Create Express app
const app = express()

// Apply security middleware
app.use(helmet()) // Add security headers
app.use("/api", apiLimiter) // Apply rate limiting to API routes

// Apply CORS middleware - use our custom middleware for Vercel
if (process.env.VERCEL || process.env.DEPLOY_TARGET === 'vercel') {
  console.log('Using Vercel CORS middleware');
  app.use(vercelCorsMiddleware);
}
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  }),
)

// Add OPTIONS handling for preflight requests
app.options('*', cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true
}))

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
})


app.use(express.json())

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"))
}

testConnection()

app.use("/api/auth", require("../routes/authRoutes"))
app.use("/api/attendance", require("../routes/attendanceRoutes"))
app.use("/api/leave", require("../routes/leaveRoutes"))
app.use("/api/users", require("../routes/userRoutes"))
app.use("/api/departments", require("../routes/departmentRoutes"))
app.use("/api/documents", require("../routes/documentRoutes"))
app.use("/api/compensation", require("../routes/compensationRoutes"))
app.use("/api/payroll", require("../routes/payrollRoutes"))
app.use("/api/reports", require("../routes/reportRoutes"))
app.use("/api/employees", require("../routes/employeeRoutes"))

app.get("/test", (_req, res) => {
  res.status(200).json({ status: "ok", message: "Test endpoint working" })
})
app.get("/health", async (_req, res) => {
  try {
    // Test database connection
    const dbConnected = await testConnection();

    // Get database pool status
    const poolStatus = getPoolStatus();

    res.status(200).json({
      status: dbConnected ? "ok" : "warning",
      message: dbConnected ? "Server is running with database connection" : "Server is running but database connection failed",
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      database: {
        connected: dbConnected,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        ssl: process.env.DB_SSL === "true" ? "enabled" : "disabled",
        pool: poolStatus
      },
      vercel: process.env.VERCEL ? true : false
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error checking server health",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
})

// Add a pool management endpoint
app.get("/pool-status", async (_req, res) => {
  try {
    const poolStatus = getPoolStatus();
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      pool: poolStatus
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error getting pool status",
      error: error.message
    });
  }
})

// Add a pool reset endpoint
app.post("/reset-pool", async (_req, res) => {
  try {
    const result = await destroyConnectionPool();
    res.status(200).json({
      success: result,
      message: result ? "Connection pool reset successfully" : "Failed to reset connection pool",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error resetting connection pool",
      error: error.message
    });
  }
})

app.use(errorHandler)

// Handle serverless deployment (Vercel)
const handleServerless = (req, res) => {
  // Handle OPTIONS requests for CORS preflight
  if (req.method === "OPTIONS") {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.status(200).end();
    return;
  }

  // Forward the request to the Express app
  return app(req, res);
};

// Export for serverless environments (Vercel)
module.exports = handleServerless;

// For traditional Node.js environments
if (process.env.NODE_ENV !== 'production' || process.env.DEPLOY_TARGET !== 'vercel') {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server ${process.env.NODE_ENV} running on port ${port}`)
    console.log(`Local: http://localhost:${port}`)
    console.log(`Network: http://0.0.0.0:${port}`)
    console.log(`CORS is configured to allow all origins`)
  })
}
