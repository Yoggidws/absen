const express = require("express")
const cors = require("cors")
const morgan = require("morgan")
const dotenv = require("dotenv")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
const { errorHandler } = require("../middlewares/errorMiddleware")
const { testConnection, getPoolStatus, destroyConnectionPool } = require("../config/db")

// Load environment variables
dotenv.config()

const port = process.env.PORT || 5000;
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

// --- Centralized CORS Configuration ---
// For Vercel deployment, we need to handle CORS more explicitly
const getAllowedOrigins = () => {
  const origins = process.env.ALLOWED_ORIGINS;
  console.log('Raw ALLOWED_ORIGINS env var:', origins);
  
  // Check if origins is undefined, null, empty, or contains template syntax
  if (!origins || origins.trim() === '' || origins.includes('${') || origins === 'undefined') {
    console.log('No valid ALLOWED_ORIGINS found, using defaults');
    // Default allowed origins for production - hardcoded for now
    return [
      'https://hris-jet.vercel.app',
      'https://absen-iota.vercel.app',
      'http://localhost:3000', // for local development
      'http://127.0.0.1:3000'   // for local development
    ];
  }
  
  const parsedOrigins = origins.split(',').map(origin => origin.trim());
  console.log('Parsed allowed origins:', parsedOrigins);
  return parsedOrigins;
};

const allowedOrigins = getAllowedOrigins();

const corsOptions = {
  origin: (origin, callback) => {
    console.log('CORS request from origin:', origin);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('VERCEL:', process.env.VERCEL);
    
    const allowedOrigins = getAllowedOrigins();
    console.log('Allowed origins:', allowedOrigins);
    
    // Allow requests with no origin (like mobile apps, curl requests, or same-origin)
    if (!origin) {
      console.log('No origin header, allowing request');
      return callback(null, true);
    }
    
    // Allow all origins in development or if VERCEL environment is detected and ALLOWED_ORIGINS is not properly set
    if (process.env.NODE_ENV === 'development' || 
        (process.env.VERCEL && (!process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS.includes('${')))) {
      console.log('Development mode or Vercel env issue detected, allowing all origins');
      return callback(null, true);
    }
    
    // Check if origin is in allowed list or if we allow all origins
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      console.log('Origin allowed:', origin);
      callback(null, true);
    } else {
      console.log('Origin not allowed:', origin);
      console.log('Available origins:', allowedOrigins);
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers"
  ],
  optionsSuccessStatus: 200 // For legacy browser support
}

// Enable pre-flight across-the-board
app.options('*', cors(corsOptions))

// Apply main CORS middleware
app.use(cors(corsOptions));
// --- End of CORS Configuration ---


// Apply security middleware
app.use(helmet()) // Add security headers
app.use("/api", apiLimiter) // Apply rate limiting to API routes

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
app.use("/api/announcements", require("../routes/announcementRoutes"))
app.use("/api/roles", require("../routes/roleRoutes"))
app.use("/api/permissions", require("../routes/permissionRoutes"))
app.use("/api/master-data", require("../routes/masterDataRoutes"))

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
      cors: {
        allowedOrigins: getAllowedOrigins(),
        rawAllowedOrigins: process.env.ALLOWED_ORIGINS
      },
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

// The serverless handler no longer needs its own CORS logic.
// The main `app.use(cors(corsOptions))` will handle it.
const handleServerless = (req, res) => {
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
    if (process.env.NODE_ENV === 'development') {
        console.log(`CORS is configured to allow all origins in development mode.`)
    } else {
        console.log(`CORS is configured to allow origins: ${process.env.ALLOWED_ORIGINS}`)
    }
  })
}
