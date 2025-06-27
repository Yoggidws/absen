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
      'https://hris-jet.vercel.app',     // Correct frontend URL from error message
      'https://hrsyst.vercel.app',       // Alternative frontend URL from logs
      'https://absen-iota.vercel.app',   // Backend URL
      'http://localhost:3000',           // for local development
      'http://127.0.0.1:3000',           // for local development
      '*'                                // wildcard for now
    ];
  }
  
  const parsedOrigins = origins.split(',').map(origin => origin.trim());
  console.log('Parsed allowed origins:', parsedOrigins);
  return parsedOrigins;
};

const allowedOrigins = getAllowedOrigins();

const corsOptions = {
  origin: true, // Allow all origins since we handle this in serverless handler
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
  optionsSuccessStatus: 200
}

// Enable pre-flight across-the-board
app.options('*', cors(corsOptions))

// Apply main CORS middleware (simplified for serverless)
app.use(cors(corsOptions));
// --- End of CORS Configuration ---


// Apply security middleware
app.use(helmet()) // Add security headers
app.use("/api", apiLimiter) // Apply rate limiting to API routes

// Simplified CORS middleware for Express app (backup only)
app.use((req, res, next) => {
  // Only set headers if not already set by serverless handler
  if (!res.getHeader('Access-Control-Allow-Origin')) {
    const origin = req.headers.origin;
    console.log('Express middleware setting CORS for origin:', origin);
    
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }
    
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Request-Method, Access-Control-Request-Headers');
  }
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Express middleware handling OPTIONS');
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

app.get("/cors-test", (req, res) => {
  console.log('CORS test endpoint called');
  console.log('Request origin:', req.headers.origin);
  console.log('Current response headers:', {
    'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin'),
    'Access-Control-Allow-Credentials': res.getHeader('Access-Control-Allow-Credentials'),
    'Access-Control-Allow-Methods': res.getHeader('Access-Control-Allow-Methods')
  });
  
  res.status(200).json({ 
    status: "ok", 
    message: "CORS test endpoint working",
    origin: req.headers.origin,
    corsHeaders: {
      'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Credentials': res.getHeader('Access-Control-Allow-Credentials'),
      'Access-Control-Allow-Methods': res.getHeader('Access-Control-Allow-Methods')
    }
  })
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
  console.log('=== SERVERLESS HANDLER START ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Origin header:', req.headers.origin);
  console.log('User-Agent:', req.headers['user-agent']);
  console.log('All headers:', JSON.stringify(req.headers, null, 2));
  
  // SET CORS HEADERS IMMEDIATELY - BEFORE ANYTHING ELSE
  const origin = req.headers.origin;
  console.log('Processing origin:', origin);
  console.log('Environment variables:');
  console.log('- NODE_ENV:', process.env.NODE_ENV);
  console.log('- VERCEL:', process.env.VERCEL);
  console.log('- ALLOWED_ORIGINS:', process.env.ALLOWED_ORIGINS);
  
  // Always set permissive CORS headers for Vercel environment
  const allowOrigin = origin || 'https://hris-jet.vercel.app';
  console.log('Setting Access-Control-Allow-Origin to:', allowOrigin);
  
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Request-Method, Access-Control-Request-Headers, Cache-Control, Pragma');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
  res.setHeader('Vary', 'Origin');
  
  // Verify headers were set
  const setHeaders = {
    'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin'),
    'Access-Control-Allow-Credentials': res.getHeader('Access-Control-Allow-Credentials'),
    'Access-Control-Allow-Methods': res.getHeader('Access-Control-Allow-Methods'),
    'Access-Control-Allow-Headers': res.getHeader('Access-Control-Allow-Headers')
  };
  console.log('CORS headers set successfully:', setHeaders);
  
  // Handle preflight OPTIONS requests immediately
  if (req.method === 'OPTIONS') {
    console.log('=== HANDLING OPTIONS PREFLIGHT ===');
    console.log('Responding with 200 OK and ending request');
    res.status(200);
    res.end();
    return;
  }
  
  console.log('=== PASSING TO EXPRESS APP ===');
  try {
    return app(req, res);
  } catch (error) {
    console.error('Error in Express app:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
