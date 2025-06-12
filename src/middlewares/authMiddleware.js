const jwt = require("jsonwebtoken")
const { asyncHandler } = require("./errorMiddleware")
const { db } = require("../config/db")
const { fetchUserRolesAndPermissions } = require("./permissionMiddleware")
require("dotenv").config()

/**
 * Middleware to protect routes that require authentication.
 * Verifies the JWT token from the Authorization header, fetches the user,
 * and attaches the user's full details including roles and permissions to the request object.
 */
const protect = asyncHandler(async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1]

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET)

      // Get user from the token
      const user = await db("users")
        .where({ id: decoded.id })
        .select(
          "id",
          "name",
          "email",
          "role",
          "department",
          "position",
          "avatar",
          "active"
        )
        .first()

      if (!user) {
        res.status(401)
        throw new Error("Not authorized, user not found for this token.")
      }

      // Check if user is active
      if (!user.active) {
        res.status(401)
        throw new Error("Your account has been deactivated. Please contact an administrator.")
      }
      
      // Fetch the latest roles and permissions for the user
      const authData = await fetchUserRolesAndPermissions(user.id);

      // Attach user and auth data to the request object
      req.user = {
        ...user,
        roles: authData.roles,
        permissions: authData.permissions
      }

      next()
    } catch (error) {
      console.error("Authentication error:", error.message)
      res.status(401)
      // Pass a more specific error message
      throw new Error(`Not authorized. Token verification failed: ${error.message}`)
    }
  }

  if (!token) {
    res.status(401)
    throw new Error("Not authorized, no token provided.")
  }
})

module.exports = { protect }
