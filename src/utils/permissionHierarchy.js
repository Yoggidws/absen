/**
 * Permission Hierarchy System
 * Defines role inheritance and permission hierarchies
 */

// Role hierarchy - higher roles inherit permissions from lower roles
const ROLE_HIERARCHY = {
  admin: ['hr_manager', 'manager', 'payroll', 'hr', 'employee'],
  hr_manager: ['hr', 'manager', 'employee'],
  manager: ['employee'],
  payroll: ['employee'],
  hr: ['employee'],
  employee: []
}

// Permission categories with inheritance
const PERMISSION_HIERARCHY = {
  // Management permissions inherit view permissions
  manage_users: ['view_users'],
  manage_attendance: ['view_attendance'],
  manage_leave: ['view_leave'],
  manage_organization: ['view_organization'],
  manage_core_hr: ['view_core_hr'],
  manage_master_data: ['view_master_data'],
  manage_payroll: ['view_payroll'],
  manage_documents: ['view_documents'],
  manage_compensation: ['view_compensation'],
  
  // Generate permissions inherit view permissions
  generate_reports: ['view_reports'],
  
  // Delete permissions inherit edit permissions
  delete_users: ['edit_users', 'view_users'],
  
  // Edit permissions inherit view permissions
  edit_users: ['view_users'],
  create_users: ['view_users']
}

/**
 * Get all permissions for a role including inherited permissions
 * @param {string} roleName - Role name
 * @param {Array} userPermissions - User's direct permissions
 * @returns {Array} - All permissions including inherited ones
 */
const getEffectivePermissions = (roleName, userPermissions = []) => {
  const effectivePermissions = new Set(userPermissions.map(p => p.name || p))
  
  // Add inherited role permissions
  const inheritedRoles = ROLE_HIERARCHY[roleName] || []
  
  // Admin gets all permissions
  if (roleName === 'admin') {
    return ['*'] // Wildcard for all permissions
  }
  
  // Add permission hierarchy
  userPermissions.forEach(permission => {
    const permName = permission.name || permission
    const inheritedPerms = PERMISSION_HIERARCHY[permName] || []
    inheritedPerms.forEach(inherited => effectivePermissions.add(inherited))
  })
  
  return Array.from(effectivePermissions)
}

/**
 * Check if a role has permission (including inherited)
 * @param {string} roleName - Role name
 * @param {Array} userPermissions - User's permissions
 * @param {string} requiredPermission - Permission to check
 * @returns {boolean} - Whether user has permission
 */
const hasEffectivePermission = (roleName, userPermissions, requiredPermission) => {
  // Admin has all permissions
  if (roleName === 'admin') {
    return true
  }
  
  const effectivePermissions = getEffectivePermissions(roleName, userPermissions)
  
  // Check direct permission
  if (effectivePermissions.includes(requiredPermission)) {
    return true
  }
  
  // Check if any permission grants this through hierarchy
  return effectivePermissions.some(permission => {
    const grants = PERMISSION_HIERARCHY[permission] || []
    return grants.includes(requiredPermission)
  })
}

/**
 * Get all roles a user effectively has (including inherited)
 * @param {Array} userRoles - User's direct roles
 * @returns {Array} - All effective roles
 */
const getEffectiveRoles = (userRoles) => {
  const effectiveRoles = new Set()
  
  userRoles.forEach(role => {
    const roleName = role.name || role
    effectiveRoles.add(roleName)
    
    // Add inherited roles
    const inheritedRoles = ROLE_HIERARCHY[roleName] || []
    inheritedRoles.forEach(inherited => effectiveRoles.add(inherited))
  })
  
  return Array.from(effectiveRoles)
}

/**
 * Check if user has role (including inherited)
 * @param {Array} userRoles - User's roles
 * @param {string} requiredRole - Role to check
 * @returns {boolean} - Whether user has role
 */
const hasEffectiveRole = (userRoles, requiredRole) => {
  const effectiveRoles = getEffectiveRoles(userRoles)
  return effectiveRoles.includes(requiredRole)
}

/**
 * Get permission matrix for a role
 * @param {string} roleName - Role name
 * @returns {Object} - Permission matrix
 */
const getPermissionMatrix = (roleName) => {
  const matrix = {
    role: roleName,
    inherits_from: ROLE_HIERARCHY[roleName] || [],
    direct_permissions: [],
    inherited_permissions: [],
    effective_permissions: []
  }
  
  // This would typically fetch from database
  // For now, return the structure
  return matrix
}

/**
 * Validate role hierarchy (prevent circular dependencies)
 * @param {Object} hierarchy - Role hierarchy to validate
 * @returns {boolean} - Whether hierarchy is valid
 */
const validateRoleHierarchy = (hierarchy = ROLE_HIERARCHY) => {
  const visited = new Set()
  const recursionStack = new Set()
  
  const hasCycle = (role) => {
    if (recursionStack.has(role)) return true
    if (visited.has(role)) return false
    
    visited.add(role)
    recursionStack.add(role)
    
    const children = hierarchy[role] || []
    for (const child of children) {
      if (hasCycle(child)) return true
    }
    
    recursionStack.delete(role)
    return false
  }
  
  for (const role in hierarchy) {
    if (hasCycle(role)) {
      console.error(`Circular dependency detected in role hierarchy: ${role}`)
      return false
    }
  }
  
  return true
}

module.exports = {
  ROLE_HIERARCHY,
  PERMISSION_HIERARCHY,
  getEffectivePermissions,
  hasEffectivePermission,
  getEffectiveRoles,
  hasEffectiveRole,
  getPermissionMatrix,
  validateRoleHierarchy
} 