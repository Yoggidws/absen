const jwt = require("jsonwebtoken")
const { asyncHandler } = require("./errorMiddleware")
const { db } = require("../config/db")
require("dotenv").config()

/**
 * Protect routes - verify JWT token and set user in request
 */
const protect = asyncHandler(async (req, res, next) => {
  let token

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1]

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET)

      // Get user from the token (exclude password)
      req.user = await db("users")
        .where({ id: decoded.id })
        .select("id", "name", "email", "role", "department", "position", "avatar", "active")
        .first()

      if (!req.user) {
        res.status(401)
        throw new Error("User not found")
      }

      next()
    } catch (error) {
      console.error(error)
      res.status(403)
      throw new Error("Not authorized, token failed")
    }
  }

  if (!token) {
    res.status(401)
    throw new Error("Not authorized, no token")
  }
})

/**
 * Admin only middleware
 */
const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next()
  } else {
    res.status(403)
    throw new Error("Not authorized as an admin")
  }
}

module.exports = { protect, admin }
