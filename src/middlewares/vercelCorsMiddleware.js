/**
 * Enhanced CORS middleware for all environments
 * This ensures proper handling of preflight requests and CORS headers
 * Works for both Vercel and traditional deployments
 */
function vercelCorsMiddleware(req, res, next) {
  // Get allowed origins from environment variable or use wildcard
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'];

  // Get the origin of the request
  const origin = req.headers.origin;

  // Check if the origin is allowed or if we're using wildcard
  if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else if (origin) {
    // If we have an origin but it's not in our allowed list, still allow it in development
    if (process.env.NODE_ENV === 'development') {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
    }
  } else {
    // No origin header, use wildcard
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  // Set other CORS headers
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, access-control-allow-methods, Access-Control-Allow-Methods, *');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', '*');
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
