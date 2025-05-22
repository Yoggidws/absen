const { db } = require("../config/db")

const Permission = {
  /**
   * Find a permission by ID
   * @param {string} id - Permission ID
   * @returns {Promise<Object>} - Permission object
   */
  findById: async (id) => {
    return await db("permissions").where({ id }).first()
  },

  /**
   * Find a permission by name
   * @param {string} name - Permission name
   * @returns {Promise<Object>} - Permission object
   */
  findByName: async (name) => {
    return await db("permissions").where({ name }).first()
  },

  /**
   * Get all permissions with optional filtering
   * @param {Object} filter - Filter criteria
   * @returns {Promise<Array>} - Array of permission objects
   */
  findAll: async (filter = {}) => {
    const query = db("permissions")

    // Filter by category
    if (filter.category) {
      query.where("category", filter.category)
    }

    // Order by category and name
    query.orderBy([
      { column: "category", order: "asc" },
      { column: "name", order: "asc" }
    ])

    return await query
  },

  /**
   * Get permissions by role ID
   * @param {string} roleId - Role ID
   * @returns {Promise<Array>} - Array of permission objects
   */
  findByRoleId: async (roleId) => {
    return await db("permissions")
      .join("role_permissions", "permissions.id", "role_permissions.permission_id")
      .where("role_permissions.role_id", roleId)
      .select("permissions.*")
      .orderBy([
        { column: "permissions.category", order: "asc" },
        { column: "permissions.name", order: "asc" }
      ])
  },

  /**
   * Get permissions by user ID
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Array of permission objects
   */
  findByUserId: async (userId) => {
    return await db("permissions")
      .join("role_permissions", "permissions.id", "role_permissions.permission_id")
      .join("user_roles", "role_permissions.role_id", "user_roles.role_id")
      .where("user_roles.user_id", userId)
      .select("permissions.*")
      .distinct()
      .orderBy([
        { column: "permissions.category", order: "asc" },
        { column: "permissions.name", order: "asc" }
      ])
  },

  /**
   * Check if a user has a specific permission
   * @param {string} userId - User ID
   * @param {string} permissionName - Permission name
   * @returns {Promise<boolean>} - True if user has permission
   */
  userHasPermission: async (userId, permissionName) => {
    const count = await db("permissions")
      .join("role_permissions", "permissions.id", "role_permissions.permission_id")
      .join("user_roles", "role_permissions.role_id", "user_roles.role_id")
      .where("user_roles.user_id", userId)
      .where("permissions.name", permissionName)
      .count("* as count")
      .first()

    return count.count > 0
  },

  /**
   * Check if a user has any of the specified permissions
   * @param {string} userId - User ID
   * @param {Array<string>} permissionNames - Array of permission names
   * @returns {Promise<boolean>} - True if user has any of the permissions
   */
  userHasAnyPermission: async (userId, permissionNames) => {
    const count = await db("permissions")
      .join("role_permissions", "permissions.id", "role_permissions.permission_id")
      .join("user_roles", "role_permissions.role_id", "user_roles.role_id")
      .where("user_roles.user_id", userId)
      .whereIn("permissions.name", permissionNames)
      .count("* as count")
      .first()

    return count.count > 0
  },

  /**
   * Check if a user has all of the specified permissions
   * @param {string} userId - User ID
   * @param {Array<string>} permissionNames - Array of permission names
   * @returns {Promise<boolean>} - True if user has all of the permissions
   */
  userHasAllPermissions: async (userId, permissionNames) => {
    const permissions = await db("permissions")
      .join("role_permissions", "permissions.id", "role_permissions.permission_id")
      .join("user_roles", "role_permissions.role_id", "user_roles.role_id")
      .where("user_roles.user_id", userId)
      .whereIn("permissions.name", permissionNames)
      .select("permissions.name")
      .distinct()

    const userPermissionNames = permissions.map(p => p.name)
    return permissionNames.every(name => userPermissionNames.includes(name))
  }
}

module.exports = Permission
