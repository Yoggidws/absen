const jwt = require("jsonwebtoken")
const { asyncHandler } = require("./errorMiddleware")
const { db } = require("../config/db")
const { loadUserAuthData, clearUserPermissionCache, RBAC_CONFIG } = require("./rbacMiddleware")
const { logLoginAttempt, logAccessAttempt } = require("../utils/auditLogger")
require("dotenv").config()

// Enhanced caching and rate limiting
const authCache = new Map()
const rateLimitCache = new Map()
const blacklistedTokens = new Set()
const CACHE_TTL = 15 * 60 * 1000 // Increase to 15 minutes for better performance

/**
 * Rate limiting per user
 */
const checkRateLimit = (userId, userRoles) => {
  const now = Date.now()
  const userRate = rateLimitCache.get(userId) || { requests: 0, windowStart: now }
  
  // Determine rate limit based on highest role
  let rateLimit = RBAC_CONFIG.RATE_LIMITS.employee // Default
  for (const [role, limit] of Object.entries(RBAC_CONFIG.RATE_LIMITS)) {
    if (userRoles.includes(role)) {
      rateLimit = limit
      break
    }
  }
  
  // Reset window if expired
  if (now - userRate.windowStart > rateLimit.window) {
    userRate.requests = 0
    userRate.windowStart = now
  }
  
  userRate.requests++
  rateLimitCache.set(userId, userRate)
  
  if (userRate.requests > rateLimit.requests) {
    throw new Error('Rate limit exceeded')
  }
  
  return {
    remaining: Math.max(0, rateLimit.requests - userRate.requests),
    reset: new Date(userRate.windowStart + rateLimit.window),
    limit: rateLimit.requests
  }
}

/**
 * Enhanced protect middleware with RBAC integration
 */
const enhancedProtect = asyncHandler(async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1]
      
      // Check if token is blacklisted
      if (blacklistedTokens.has(token)) {
        res.status(401)
        throw new Error("Token has been revoked")
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      
      // Check cache first
      const cacheKey = `enhanced_auth_${decoded.id}`
      const cached = authCache.get(cacheKey)
      
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        req.user = cached.user
        req.authData = cached.authData
        req.effectiveRoles = cached.effectiveRoles
        
        // Add helper methods
        req.hasRole = cached.hasRole
        req.hasPermission = cached.hasPermission
        req.hasAnyRole = cached.hasAnyRole
        req.hasAllPermissions = cached.hasAllPermissions
        req.hasAnyPermission = cached.hasAnyPermission
        
        // Rate limiting
        try {
          const rateLimitInfo = checkRateLimit(decoded.id, cached.authData.roleNames)
          res.setHeader('X-RateLimit-Limit', rateLimitInfo.limit)
          res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remaining)
          res.setHeader('X-RateLimit-Reset', rateLimitInfo.reset.toISOString())
        } catch (rateLimitError) {
          res.status(429)
          throw new Error(rateLimitError.message)
        }
        
        return next()
      }

      // Load complete auth data using RBAC system
      const authData = await Promise.race([
        loadUserAuthData(decoded.id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth data loading timeout')), 8000)
        )
      ]);
      const { user, roleNames, permissionNames } = authData
      
      if (!user.active) {
        res.status(401)
        throw new Error("User account is deactivated")
      }
      
      // Calculate effective roles (including inherited)
      const effectiveRoles = new Set(roleNames)
      roleNames.forEach(role => {
        const inheritedRoles = RBAC_CONFIG.ROLE_HIERARCHY[role] || []
        inheritedRoles.forEach(inherited => effectiveRoles.add(inherited))
      })
      const effectiveRoleArray = Array.from(effectiveRoles)
      
      // Enhanced helper methods
      const hasRole = (roleName) => {
        return effectiveRoleArray.includes(roleName.toLowerCase()) ||
               (user.legacy_role && user.legacy_role.toLowerCase() === roleName.toLowerCase())
      }

      const hasPermission = (permissionName) => {
        if (effectiveRoleArray.includes('admin') || effectiveRoleArray.includes('super_admin')) {
          return true // Admin has all permissions
        }
        
        // Check direct permission
        if (permissionNames.includes(permissionName)) {
          return true
        }
        
        // Check pattern-based permissions
        for (const role of effectiveRoleArray) {
          const patterns = RBAC_CONFIG.PERMISSION_PATTERNS[role] || []
          for (const pattern of patterns) {
            if (pattern === '*') return true
            
            if (pattern.includes(':') && permissionName.includes(':')) {
              const [patternAction, patternResource] = pattern.split(':')
              const [reqAction, reqResource] = permissionName.split(':')
              
              if (patternAction === '*' && patternResource === reqResource) return true
              if (patternAction === reqAction && patternResource === '*') return true
              if (patternAction === '*' && patternResource === '*') return true
            }
          }
        }
        
        return false
      }

      const hasAnyRole = (roleList) => {
        return roleList.some(role => hasRole(role))
      }

      const hasAllPermissions = (permissionList) => {
        return permissionList.every(permission => hasPermission(permission))
      }

      const hasAnyPermission = (permissionList) => {
        return permissionList.some(permission => hasPermission(permission))
      }

      // Attach to request
      req.user = user
      req.authData = authData
      req.effectiveRoles = effectiveRoleArray
      req.hasRole = hasRole
      req.hasPermission = hasPermission
      req.hasAnyRole = hasAnyRole
      req.hasAllPermissions = hasAllPermissions
      req.hasAnyPermission = hasAnyPermission

      // Rate limiting
      try {
        const rateLimitInfo = checkRateLimit(user.id, roleNames)
        res.setHeader('X-RateLimit-Limit', rateLimitInfo.limit)
        res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remaining)
        res.setHeader('X-RateLimit-Reset', rateLimitInfo.reset.toISOString())
      } catch (rateLimitError) {
        await logAccessAttempt(req, 'auth', false, 'rate_limit_exceeded')
        res.status(429)
        throw new Error(rateLimitError.message)
      }

      // Cache the result
      authCache.set(cacheKey, {
        user,
        authData,
        effectiveRoles: effectiveRoleArray,
        hasRole,
        hasPermission,
        hasAnyRole,
        hasAllPermissions,
        hasAnyPermission,
        timestamp: Date.now()
      })

      // Auto-expire cache
      setTimeout(() => authCache.delete(cacheKey), CACHE_TTL)
      
      await logAccessAttempt(req, 'auth', true)
      next()
      
    } catch (error) {
      console.error("Auth error:", error)
      await logAccessAttempt(req, 'auth', false, error.message)
      
      if (error.name === 'TokenExpiredError') {
        res.status(401)
        throw new Error("Token has expired")
      } else if (error.name === 'JsonWebTokenError') {
        res.status(401)
        throw new Error("Invalid token")
      } else {
        res.status(401)
        throw new Error(error.message || "Not authorized, token failed")
      }
    }
  } else {
    await logAccessAttempt(req, 'auth', false, 'no_token')
    res.status(401)
    throw new Error("Not authorized, no token")
  }
})

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      await enhancedProtect(req, res, next)
    } catch (error) {
      // Continue without authentication for optional auth
      next()
    }
  } else {
    next()
  }
})

/**
 * Admin-only middleware
 */
const adminOnly = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    res.status(401)
    throw new Error("Authentication required")
  }

  if (!req.hasRole('admin') && !req.hasRole('super_admin')) {
    res.status(403)
    throw new Error("Admin access required")
  }

  next()
})

/**
 * Soft delete user sessions (token blacklisting)
 */
const revokeToken = (token) => {
  blacklistedTokens.add(token)
  
  // Clean up old tokens periodically
  if (blacklistedTokens.size > 10000) {
    // Keep only recent 5000 tokens
    const tokensArray = Array.from(blacklistedTokens)
    blacklistedTokens.clear()
    tokensArray.slice(-5000).forEach(t => blacklistedTokens.add(t))
  }
}

/**
 * Logout middleware
 */
const logout = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]
  if (token) {
    revokeToken(token)
    
    // Clear user cache
    if (req.user) {
      clearUserPermissionCache(req.user.id)
      authCache.delete(`enhanced_auth_${req.user.id}`)
      rateLimitCache.delete(req.user.id)
    }
  }
  
  res.status(200).json({
    success: true,
    message: "Logged out successfully"
  })
})

/**
 * Resource-level permission middleware with ownership check
 */
/*
const resourcePermission = (permission, options = {}) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      res.status(401)
      throw new Error("Authentication required")
    }

    const {
      resourceType = null,
      resourceIdParam = 'id',
      allowOwner = false,
      allowDepartmentScope = false,
      ownerField = 'user_id'
    } = options

    // Check basic permission
    if (req.hasPermission(permission)) {
      return next()
    }

    // Resource-level checks
    if (resourceType && req.params[resourceIdParam]) {
      const resourceId = req.params[resourceIdParam]
      
      if (allowOwner) {
        try {
          const tableName = resourceType === 'user' ? 'users' : `${resourceType}s`
          const resource = await db(tableName).where('id', resourceId).first()
          
          if (resource && resource[ownerField] === req.user.id) {
            return next()
          }
        } catch (error) {
          console.error('Ownership check error:', error)
        }
      }
      
      if (allowDepartmentScope && req.user.department) {
        try {
          const tableName = resourceType === 'user' ? 'users' : `${resourceType}s`
          const resource = await db(tableName).where('id', resourceId).first()
          
          if (resource && resource.department === req.user.department) {
            return next()
          }
        } catch (error) {
          console.error('Department scope check error:', error)
        }
      }
    }

    res.status(403)
    throw new Error(`Permission denied: ${permission} required`)
  })
}
*/

/**
 * Clear cache for specific user
 */
const clearUserCache = (userId) => {
  const cacheKey = `enhanced_auth_${userId}`
  authCache.delete(cacheKey)
  clearUserPermissionCache(userId)
  rateLimitCache.delete(userId)
}

/**
 * Clear all auth cache
 */
const clearAllCache = () => {
  authCache.clear()
  rateLimitCache.clear()
}

/**
 * Get cache statistics
 */
const getCacheStats = () => {
  return {
    authCacheSize: authCache.size,
    rateLimitCacheSize: rateLimitCache.size,
    blacklistedTokensSize: blacklistedTokens.size,
    cacheTTL: CACHE_TTL
  }
}

/**
 * Session management middleware
 */
const sessionManagement = asyncHandler(async (req, res, next) => {
  if (req.user) {
    // Add session info to response headers
    res.setHeader('X-Session-User', req.user.id)
    res.setHeader('X-Session-Roles', req.effectiveRoles.join(','))
    
    // Update last activity
    try {
      await db('users')
        .where('id', req.user.id)
        .update({ last_activity: new Date() })
    } catch (error) {
      console.error('Failed to update last activity:', error)
    }
  }
  
  next()
})

module.exports = {
  enhancedProtect,
  optionalAuth,
  adminOnly,
  logout,
  revokeToken,
  clearUserCache,
  clearAllCache,
  getCacheStats,
  sessionManagement,
  checkRateLimit
} 