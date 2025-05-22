const { asyncHandler } = require("./errorMiddleware")
const Permission = require("../models/Permission")
const Role = require("../models/Role")

/**
 * Middleware to check if user has a specific permission
 * @param {string} permissionName - Name of the permission to check
 * @returns {Function} - Express middleware function
 */
const hasPermission = (permissionName) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      res.status(401)
      throw new Error("Not authenticated")
    }

    const hasPermission = await Permission.userHasPermission(req.user.id, permissionName)

    if (hasPermission) {
      next()
    } else {
      res.status(403)
      throw new Error(`Permission denied: ${permissionName} required`)
    }
  })
}

/**
 * Middleware to check if user has any of the specified permissions
 * @param {Array<string>} permissionNames - Array of permission names to check
 * @returns {Function} - Express middleware function
 */
const hasAnyPermission = (permissionNames) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      res.status(401)
      throw new Error("Not authenticated")
    }

    const hasPermission = await Permission.userHasAnyPermission(req.user.id, permissionNames)

    if (hasPermission) {
      next()
    } else {
      res.status(403)
      throw new Error(`Permission denied: One of [${permissionNames.join(", ")}] required`)
    }
  })
}

/**
 * Middleware to check if user has all of the specified permissions
 * @param {Array<string>} permissionNames - Array of permission names to check
 * @returns {Function} - Express middleware function
 */
const hasAllPermissions = (permissionNames) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      res.status(401)
      throw new Error("Not authenticated")
    }

    const hasPermissions = await Permission.userHasAllPermissions(req.user.id, permissionNames)

    if (hasPermissions) {
      next()
    } else {
      res.status(403)
      throw new Error(`Permission denied: All of [${permissionNames.join(", ")}] required`)
    }
  })
}

/**
 * Middleware to check if user has a specific role
 * @param {string} roleName - Name of the role to check
 * @returns {Function} - Express middleware function
 */
const hasRole = (roleName) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      res.status(401)
      throw new Error("Not authenticated")
    }

    const hasRole = await Role.userHasRole(req.user.id, roleName)

    if (hasRole) {
      next()
    } else {
      res.status(403)
      throw new Error(`Role required: ${roleName}`)
    }
  })
}

/**
 * Middleware to check if user has any of the specified roles
 * @param {Array<string>} roleNames - Array of role names to check
 * @returns {Function} - Express middleware function
 */
const hasAnyRole = (roleNames) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      res.status(401)
      throw new Error("Not authenticated")
    }

    const hasRole = await Role.userHasAnyRole(req.user.id, roleNames)

    if (hasRole) {
      next()
    } else {
      res.status(403)
      throw new Error(`Role required: One of [${roleNames.join(", ")}]`)
    }
  })
}

// Convenience middleware for common role combinations
const isAdmin = hasRole("admin")
const isManager = hasAnyRole(["admin", "manager", "hr_manager"])
const isHR = hasAnyRole(["admin", "hr", "hr_manager"])
const isPayroll = hasAnyRole(["admin", "payroll"])

module.exports = {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  hasAnyRole,
  isAdmin,
  isManager,
  isHR,
  isPayroll
}
