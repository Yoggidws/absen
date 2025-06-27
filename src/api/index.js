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
  origin: true, // Allow all origins for now to fix the immediate issue
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

// Add explicit CORS headers middleware as a backup
app.use((req, res, next) => {
  const allowedOrigins = getAllowedOrigins();
  const origin = req.headers.origin;
  
  console.log('Setting explicit CORS headers for request:', req.method, req.url);
  console.log('Request origin:', origin);
  console.log('Allowed origins:', allowedOrigins);
  
  // Check if wildcard is in allowed origins
  const hasWildcard = allowedOrigins.includes('*');
  console.log('Has wildcard permission:', hasWildcard);
  
  // Set CORS headers based on configuration
  if (hasWildcard) {
    console.log('Setting wildcard CORS header due to * in ALLOWED_ORIGINS');
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else if (process.env.VERCEL || process.env.NODE_ENV === 'development' || 
             !process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS.includes('${')) {
    console.log('Setting permissive CORS headers for Vercel/dev environment');
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    console.log('Setting CORS header for specific allowed origin:', origin);
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    console.log('Setting fallback CORS headers');
    res.header('Access-Control-Allow-Origin', 'https://hris-jet.vercel.app');
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Request-Method, Access-Control-Request-Headers');
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    res.status(200).end();
    return;
  }
  
  next();
});

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

// The serverless handler with improved CORS handling
const handleServerless = (req, res) => {
  console.log('Serverless handler called for:', req.method, req.url);
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  
  // Ensure CORS headers are set for serverless environment
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  const hasWildcard = allowedOrigins.includes('*');
  
  console.log('Serverless request origin:', origin);
  console.log('Serverless allowed origins:', allowedOrigins);
  console.log('Serverless has wildcard:', hasWildcard);
  
  // Set CORS headers directly for Vercel
  if (hasWildcard) {
    console.log('Setting wildcard CORS in serverless handler');
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && (origin.includes('hris-jet.vercel.app') || origin.includes('absen-iota.vercel.app') || origin.includes('localhost'))) {
    console.log('Setting specific origin CORS in serverless handler:', origin);
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    console.log('Setting fallback CORS in serverless handler');
    res.setHeader('Access-Control-Allow-Origin', 'https://hris-jet.vercel.app');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Request-Method, Access-Control-Request-Headers');
  
  // Handle preflight OPTIONS requests immediately
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS in serverless handler');
    res.status(200).end();
    return;
  }
  
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
