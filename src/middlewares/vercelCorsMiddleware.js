/**
 * Custom CORS middleware specifically for Vercel deployment
 * This ensures proper handling of preflight requests and CORS headers
 */
function vercelCorsMiddleware(req, res, next) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Continue to the next middleware
  next();
}

module.exports = vercelCorsMiddleware;
