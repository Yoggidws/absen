const jwt = require("jsonwebtoken")
const { asyncHandler } = require("./errorMiddleware")
const { db } = require("../config/db")
const Role = require("../models/Role")
const Permission = require("../models/Permission")
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

      // Load user roles
      req.userRoles = await Role.findByUserId(req.user.id)

      // Load user permissions
      req.userPermissions = await Permission.findByUserId(req.user.id)

      // Create helper methods for permission checking
      req.hasPermission = (permissionName) => {
        return req.userPermissions.some(p => p.name === permissionName)
      }

      req.hasRole = (roleName) => {
        return req.userRoles.some(r => r.name === roleName)
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
  if (req.user && req.hasRole("admin")) {
    next()
  } else {
    res.status(403)
    throw new Error("Not authorized as an admin")
  }
}

/**
 * HR role middleware
 * Allows access for admin and HR roles
 */
const hr = (req, res, next) => {
  if (req.user && (req.hasRole("admin") || req.hasRole("hr") || req.hasRole("hr_manager"))) {
    next()
  } else {
    res.status(403)
    throw new Error("Not authorized for HR functions")
  }
}

/**
 * Manager role middleware
 * Allows access for admin, HR, and manager roles
 */
const manager = (req, res, next) => {
  if (req.user && (req.hasRole("admin") || req.hasRole("manager") || req.hasRole("hr_manager"))) {
    next()
  } else {
    res.status(403)
    throw new Error("Not authorized for manager functions")
  }
}

/**
 * Payroll role middleware
 * Allows access for admin and payroll roles
 */
const payroll = (req, res, next) => {
  if (req.user && (req.hasRole("admin") || req.hasRole("payroll"))) {
    next()
  } else {
    res.status(403)
    throw new Error("Not authorized for payroll functions")
  }
}

/**
 * Permission-based middleware
 * Checks if user has the specified permission
 */
const hasPermission = (permissionName) => {
  return (req, res, next) => {
    if (req.user && req.hasPermission(permissionName)) {
      next()
    } else {
      res.status(403)
      throw new Error(`Permission denied: ${permissionName} required`)
    }
  }
}

module.exports = {
  protect,
  admin,
  hr,
  manager,
  payroll,
  hasPermission
}
