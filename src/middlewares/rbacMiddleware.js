const { db } = require("../config/db")
const { asyncHandler } = require("./errorMiddleware")
const { logPermissionCheck } = require("../utils/auditLogger")

// Multi-level cache with TTL
const permissionCache = new Map()
const roleHierarchyCache = new Map()
const resourceCache = new Map()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

/**
 * RBAC Configuration
 */
const RBAC_CONFIG = {
  // Role hierarchy (higher roles inherit from lower roles)
  ROLE_HIERARCHY: {
    'super_admin': ['admin', 'hr_manager', 'manager', 'payroll', 'hr', 'employee'],
    'admin': ['hr_manager', 'manager', 'payroll', 'hr', 'employee'],
    'hr_manager': ['hr', 'manager', 'employee'],
    'manager': ['employee'],
    'payroll': ['employee'],
    'hr': ['employee'],
    'employee': []
  },
  
  // Permission patterns for dynamic checking
  PERMISSION_PATTERNS: {
    'admin': ['*'], // Admin has all permissions
    'hr_manager': ['*:hr', '*:user', '*:employee', '*:leave', '*:document'],
    'manager': ['read:*', 'approve:leave', 'view:team'],
    'payroll': ['*:payroll', '*:compensation', 'read:user'],
    'hr': ['*:hr', '*:employee', 'read:user', '*:leave'],
    'employee': ['read:own', 'create:own', 'update:own']
  },

  // Resource ownership patterns
  RESOURCE_OWNERSHIP: {
    'user': 'user_id',
    'document': 'user_id', 
    'attendance': 'user_id',
    'leave_request': 'user_id',
    'employee': 'user_id'
  },

  // Department-scoped resources
  DEPARTMENT_SCOPED: ['user', 'employee', 'attendance', 'leave_request'],

  // System-protected resources
  PROTECTED_RESOURCES: ['role', 'permission', 'system_config'],

  // Rate limiting per role
  RATE_LIMITS: {
    'employee': { requests: 100, window: 15 * 60 * 1000 }, // 100 requests per 15 mins
    'manager': { requests: 200, window: 15 * 60 * 1000 },
    'hr': { requests: 300, window: 15 * 60 * 1000 },
    'admin': { requests: 500, window: 15 * 60 * 1000 }
  }
}

/**
 * Enhanced user authentication with role/permission loading
 * Optimized version with better caching and simpler queries
 */
const loadUserAuthData = async (userId, useCache = true) => {
  const cacheKey = `auth_${userId}`
  
  if (useCache && permissionCache.has(cacheKey)) {
    const cached = permissionCache.get(cacheKey)
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data
    }
  }

  try {
    // Step 1: Get basic user data with timeout
    const userQuery = db('users')
      .where('id', userId)
      .where('active', true)
      .select('id', 'name', 'email', 'role as legacy_role', 'department', 'position', 'avatar', 'active', 'created_at')
      .first()
      .timeout(5000); // 5 second timeout for user query

    // Step 2: Get user roles with timeout  
    const rolesQuery = db('user_roles as ur')
      .join('roles as r', 'ur.role_id', 'r.id')
      .where('ur.user_id', userId)
      .select('r.id', 'r.name', 'r.display_name', 'r.is_system_role')
      .timeout(5000); // 5 second timeout for roles query

    // Execute both queries in parallel with timeout protection
    const [userData, userRoles] = await Promise.all([
      Promise.race([
        userQuery,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('User query timeout')), 6000)
        )
      ]),
      Promise.race([
        rolesQuery,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Roles query timeout')), 6000)
        )
      ])
    ]);

    if (!userData) {
      throw new Error('User not found or inactive')
    }

    // Step 3: Get permissions for user roles (only if user has roles)
    let userPermissions = [];
    if (userRoles && userRoles.length > 0) {
      const roleIds = userRoles.map(r => r.id);
      
      const permissionsQuery = db('role_permissions as rp')
        .join('permissions as p', 'rp.permission_id', 'p.id')
        .whereIn('rp.role_id', roleIds)
        .select('p.id', 'p.name', 'p.category', 'p.description')
        .timeout(5000); // 5 second timeout for permissions query

      userPermissions = await Promise.race([
        permissionsQuery,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Permissions query timeout')), 6000)
        )
      ]);
    }

    const roleNames = (userRoles || []).map(r => r.name);
    let permissionNames = (userPermissions || []).map(p => p.name);

    // If user has admin role, grant all permissions for client-side checks
    if (roleNames.includes('admin') || roleNames.includes('super_admin')) {
      permissionNames = ['*'];
    }

    const result = {
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        department: userData.department,
        position: userData.position,
        avatar: userData.avatar,
        active: userData.active,
        created_at: userData.created_at,
        legacy_role: userData.legacy_role
      },
      roles: userRoles || [],
      permissions: userPermissions || [],
      roleNames: roleNames,
      permissionNames: permissionNames
    }

    // Cache the result with longer TTL for performance
    if (useCache) {
      permissionCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      })

      // Auto-expire cache
      setTimeout(() => permissionCache.delete(cacheKey), CACHE_TTL)
    }

    return result;

  } catch (error) {
    console.error(`Error loading user auth data for user ${userId}:`, error.message);
    
    // Fallback: Return basic user data with legacy role if complex query fails
    try {
      const basicUser = await db('users')
        .where('id', userId)
        .where('active', true)
        .select('id', 'name', 'email', 'role as legacy_role', 'department', 'position', 'avatar', 'active', 'created_at')
        .first()
        .timeout(3000);

      if (basicUser) {
        console.warn(`Using fallback auth data for user ${userId}`);
        return {
          user: {
            id: basicUser.id,
            name: basicUser.name,
            email: basicUser.email,
            department: basicUser.department,
            position: basicUser.position,
            avatar: basicUser.avatar,
            active: basicUser.active,
            created_at: basicUser.created_at,
            legacy_role: basicUser.legacy_role
          },
          roles: [],
          permissions: [],
          roleNames: basicUser.legacy_role ? [basicUser.legacy_role] : [],
          permissionNames: basicUser.legacy_role === 'admin' ? ['*'] : []
        };
      }
    } catch (fallbackError) {
      console.error(`Fallback query also failed for user ${userId}:`, fallbackError.message);
    }
    
    throw error;
  }
}

/**
 * Get effective roles including inherited roles
 */
const getEffectiveRoles = (userRoles) => {
  const effectiveRoles = new Set(userRoles)
  
  userRoles.forEach(role => {
    const inheritedRoles = RBAC_CONFIG.ROLE_HIERARCHY[role] || []
    inheritedRoles.forEach(inherited => effectiveRoles.add(inherited))
  })
  
  return Array.from(effectiveRoles)
}

/**
 * Check if user has permission with pattern matching
 */
const checkPermissionPattern = (userRoles, userPermissions, requiredPermission) => {
  // Super admin check
  if (userRoles.includes('admin') || userRoles.includes('super_admin')) {
    return true;
  }

  // Direct permission check
  if (userPermissions.includes(requiredPermission)) {
    return true
  }

  // Pattern-based permission check
  for (const role of userRoles) {
    const patterns = RBAC_CONFIG.PERMISSION_PATTERNS[role] || []
    
    for (const pattern of patterns) {
      if (pattern === '*') return true // Wildcard permission
      
      if (pattern.includes(':')) {
        const [action, resource] = pattern.split(':')
        const [reqAction, reqResource] = requiredPermission.split(':')
        
        // Check action wildcard
        if (action === '*' && resource === reqResource) return true
        if (action === reqAction && resource === '*') return true
        if (action === '*' && resource === '*') return true
      }
    }
  }
  
  return false
}

/**
 * Resource ownership check
 */
const checkResourceOwnership = async (resourceType, resourceId, userId) => {
  const ownershipField = RBAC_CONFIG.RESOURCE_OWNERSHIP[resourceType]
  if (!ownershipField) return false

  const resource = await db(resourceType === 'user' ? 'users' : `${resourceType}s`)
    .where('id', resourceId)
    .first()

  return resource && resource[ownershipField] === userId
}

/**
 * Department scope check
 */
const checkDepartmentScope = async (resourceType, resourceId, userDepartment) => {
  if (!RBAC_CONFIG.DEPARTMENT_SCOPED.includes(resourceType) || !userDepartment) {
    return false
  }

  const tableName = resourceType === 'user' ? 'users' : `${resourceType}s`
  const resource = await db(tableName).where('id', resourceId).first()

  return resource && resource.department === userDepartment
}

/**
 * Main RBAC middleware factory
 */
const createRBACMiddleware = (requiredPermission, options = {}) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user || !req.authData || !req.effectiveRoles) {
      res.status(401)
      throw new Error("Authentication data not found. Ensure enhancedProtect middleware is used before RBAC middleware.")
    }

    const {
      allowOwner = false,
      allowDepartmentScope = false,
      resourceType = null,
      resourceIdParam = 'id',
      bypassForRoles = [],
      additionalChecks = null
    } = options

    try {
      // Load user auth data
      const { user, permissionNames } = req.authData
      const { effectiveRoles } = req
      
      // Bypass check for specific roles
      if (bypassForRoles.length > 0 && bypassForRoles.some(role => effectiveRoles.includes(role))) {
        await logPermissionCheck(req, requiredPermission, true, 'role_bypass')
        return next()
      }

      // Check basic permission
      const hasBasicPermission = checkPermissionPattern(effectiveRoles, permissionNames, requiredPermission)
      
      if (hasBasicPermission) {
        await logPermissionCheck(req, requiredPermission, true, 'basic_permission')
        return next()
      }

      // Resource-level checks
      if (resourceType && req.params[resourceIdParam]) {
        const resourceId = req.params[resourceIdParam]
        
        // Owner check
        if (allowOwner) {
          const isOwner = await checkResourceOwnership(resourceType, resourceId, user.id)
          if (isOwner) {
            await logPermissionCheck(req, requiredPermission, true, 'resource_owner')
            return next()
          }
        }
        
        // Department scope check
        if (allowDepartmentScope && user.department) {
          const inDepartmentScope = await checkDepartmentScope(resourceType, resourceId, user.department)
          if (inDepartmentScope) {
            await logPermissionCheck(req, requiredPermission, true, 'department_scope')
            return next()
          }
        }
      }

      // Additional custom checks
      if (additionalChecks && typeof additionalChecks === 'function') {
        const customResult = await additionalChecks(req, req.authData)
        if (customResult) {
          await logPermissionCheck(req, requiredPermission, true, 'custom_check')
          return next()
        }
      }

      // Permission denied
      await logPermissionCheck(req, requiredPermission, false, 'permission_denied')
      res.status(403)
      throw new Error(`Permission denied: ${requiredPermission} required`)

    } catch (error) {
      if (res.statusCode === 403 || res.statusCode === 401) throw error;
      console.error('RBAC check error:', error)
      res.status(500)
      throw new Error('Authorization check failed')
    }
  })
}

/**
 * Role-based middleware
 */
const requireRole = (roles, options = {}) => {
  const roleArray = Array.isArray(roles) ? roles : [roles]
  
  return asyncHandler(async (req, res, next) => {
    if (!req.user || !req.authData || !req.effectiveRoles) {
      res.status(401)
      throw new Error('Authentication data not found. Ensure enhancedProtect middleware is used before RBAC middleware.')
    }
    
    const hasRole = roleArray.some(role => req.effectiveRoles.includes(role))
    
    if (hasRole) {
      next()
    } else {
      res.status(403)
      throw new Error(`Role required: ${roleArray.join(' or ')}`)
    }
  })
}

/**
 * Multiple permission check (AND logic)
 */
const requireAllPermissions = (permissions) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user || !req.authData || !req.effectiveRoles) {
      res.status(401)
      throw new Error('Authentication data not found. Ensure enhancedProtect middleware is used before RBAC middleware.')
    }

    const { permissionNames } = req.authData
    const { effectiveRoles } = req
    
    const hasAllPermissions = permissions.every(permission => 
      checkPermissionPattern(effectiveRoles, permissionNames, permission)
    )
    
    if (hasAllPermissions) {
      next()
    } else {
      res.status(403)
      throw new Error(`All permissions required: ${permissions.join(', ')}`)
    }
  })
}

/**
 * Multiple permission check (OR logic)
 */
const requireAnyPermission = (permissions) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user || !req.authData || !req.effectiveRoles) {
      res.status(401)
      throw new Error('Authentication data not found. Ensure enhancedProtect middleware is used before RBAC middleware.')
    }

    const { permissionNames } = req.authData
    const { effectiveRoles } = req
    
    const hasAnyPermission = permissions.some(permission => 
      checkPermissionPattern(effectiveRoles, permissionNames, permission)
    )
    
    if (hasAnyPermission) {
      next()
    } else {
      res.status(403)
      throw new Error(`One of these permissions required: ${permissions.join(', ')}`)
    }
  })
}

/**
 * System resource protection
 */
const protectSystemResource = asyncHandler(async (req, res, next) => {
  if (!req.user || !req.authData || !req.effectiveRoles) {
    res.status(401)
    throw new Error('Authentication data not found. Ensure enhancedProtect middleware is used before RBAC middleware.')
  }
  
  // Only super_admin and admin can access system resources
  if (req.effectiveRoles.includes('super_admin') || req.effectiveRoles.includes('admin')) {
    next()
  } else {
    res.status(403)
    throw new Error('System administrator access required')
  }
})

/**
 * Dynamic permission middleware
 */
const checkDynamicPermission = (getPermission) => {
  return asyncHandler(async (req, res, next) => {
    const permission = typeof getPermission === 'function' ? getPermission(req) : getPermission
    return createRBACMiddleware(permission)(req, res, next)
  })
}

/**
 * Cache management
 */
const clearUserPermissionCache = (userId) => {
  const cacheKey = `auth_${userId}`
  permissionCache.delete(cacheKey)
}

const clearAllPermissionCache = () => {
  permissionCache.clear()
  roleHierarchyCache.clear()
  resourceCache.clear()
}

/**
 * Convenience middleware for common patterns
 */
const rbac = {
  // Basic permission check
  can: (permission, options = {}) => createRBACMiddleware(permission, options),
  
  // Role-based access
  role: (roles) => requireRole(roles),
  
  // Multiple permissions
  allOf: (permissions) => requireAllPermissions(permissions),
  anyOf: (permissions) => requireAnyPermission(permissions),
  
  // Resource access patterns
  ownResource: (permission, resourceType) => 
    createRBACMiddleware(permission, { allowOwner: true, resourceType }),
  
  departmentResource: (permission, resourceType) => 
    createRBACMiddleware(permission, { allowDepartmentScope: true, resourceType }),
  
  ownOrDepartment: (permission, resourceType) => 
    createRBACMiddleware(permission, { 
      allowOwner: true, 
      allowDepartmentScope: true, 
      resourceType 
    }),
  
  // System protection
  systemOnly: protectSystemResource,
  
  // Dynamic permissions
  dynamic: (getPermission) => checkDynamicPermission(getPermission),
  
  // Admin or owner pattern
  adminOrOwner: (permission, resourceType) =>
    createRBACMiddleware(permission, {
      allowOwner: true,
      resourceType,
      bypassForRoles: ['admin', 'super_admin']
    })
}

module.exports = {
  createRBACMiddleware,
  requireRole,
  requireAllPermissions,
  requireAnyPermission,
  protectSystemResource,
  checkDynamicPermission,
  loadUserAuthData,
  clearUserPermissionCache,
  clearAllPermissionCache,
  RBAC_CONFIG,
  rbac
} 