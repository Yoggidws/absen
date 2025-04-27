/**
 * Custom error handler middleware
 */
require("dotenv").config()
// In src/middlewares/errorMiddleware.js
const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode

  // Log more details
  console.error(`Error: ${err.message}`)
  console.error(`Stack: ${err.stack}`)
  console.error(`Request path: ${req.path}`)
  console.error(`Request method: ${req.method}`)

  res.status(statusCode).json({
    success: false,
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  })
}
/**
 * Async handler to avoid try/catch blocks in route handlers
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

module.exports = { errorHandler, asyncHandler }
