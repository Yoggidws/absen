const { db } = require("../config/db")

const Role = {
  /**
   * Find a role by ID
   * @param {string} id - Role ID
   * @returns {Promise<Object>} - Role object
   */
  findById: async (id) => {
    return await db("roles").where({ id }).first()
  },

  /**
   * Find a role by name
   * @param {string} name - Role name
   * @returns {Promise<Object>} - Role object
   */
  findByName: async (name) => {
    return await db("roles").where({ name }).first()
  },

  /**
   * Get all roles
   * @returns {Promise<Array>} - Array of role objects
   */
  findAll: async () => {
    return await db("roles").orderBy("name", "asc")
  },

  /**
   * Get roles by user ID
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Array of role objects
   */
  findByUserId: async (userId) => {
    return await db("roles")
      .join("user_roles", "roles.id", "user_roles.role_id")
      .where("user_roles.user_id", userId)
      .select("roles.*")
      .orderBy("roles.name", "asc")
  },

  /**
   * Check if a user has a specific role
   * @param {string} userId - User ID
   * @param {string} roleName - Role name
   * @returns {Promise<boolean>} - True if user has role
   */
  userHasRole: async (userId, roleName) => {
    const count = await db("roles")
      .join("user_roles", "roles.id", "user_roles.role_id")
      .where("user_roles.user_id", userId)
      .where("roles.name", roleName)
      .count("* as count")
      .first()

    return count.count > 0
  },

  /**
   * Check if a user has any of the specified roles
   * @param {string} userId - User ID
   * @param {Array<string>} roleNames - Array of role names
   * @returns {Promise<boolean>} - True if user has any of the roles
   */
  userHasAnyRole: async (userId, roleNames) => {
    const count = await db("roles")
      .join("user_roles", "roles.id", "user_roles.role_id")
      .where("user_roles.user_id", userId)
      .whereIn("roles.name", roleNames)
      .count("* as count")
      .first()

    return count.count > 0
  },

  /**
   * Assign a role to a user
   * @param {string} userId - User ID
   * @param {string} roleId - Role ID
   * @returns {Promise<Object>} - User role mapping object
   */
  assignRoleToUser: async (userId, roleId) => {
    // Check if mapping already exists
    const existing = await db("user_roles")
      .where({ user_id: userId, role_id: roleId })
      .first()

    if (existing) {
      return existing
    }

    // Create new mapping
    const [userRole] = await db("user_roles")
      .insert({ user_id: userId, role_id: roleId })
      .returning("*")

    return userRole
  },

  /**
   * Remove a role from a user
   * @param {string} userId - User ID
   * @param {string} roleId - Role ID
   * @returns {Promise<number>} - Number of rows affected
   */
  removeRoleFromUser: async (userId, roleId) => {
    return await db("user_roles")
      .where({ user_id: userId, role_id: roleId })
      .delete()
  },

  /**
   * Create a new role
   * @param {Object} roleData - Role data
   * @returns {Promise<Object>} - Created role object
   */
  create: async (roleData) => {
    const [role] = await db("roles")
      .insert(roleData)
      .returning("*")

    return role
  },

  /**
   * Update a role
   * @param {string} id - Role ID
   * @param {Object} roleData - Role data to update
   * @returns {Promise<Object>} - Updated role object
   */
  update: async (id, roleData) => {
    const [role] = await db("roles")
      .where({ id })
      .update({ ...roleData, updated_at: db.fn.now() })
      .returning("*")

    return role
  },

  /**
   * Delete a role
   * @param {string} id - Role ID
   * @returns {Promise<number>} - Number of rows affected
   */
  delete: async (id) => {
    return await db("roles")
      .where({ id })
      .delete()
  },

  /**
   * Assign a permission to a role
   * @param {string} roleId - Role ID
   * @param {string} permissionId - Permission ID
   * @returns {Promise<Object>} - Role permission mapping object
   */
  assignPermissionToRole: async (roleId, permissionId) => {
    // Check if mapping already exists
    const existing = await db("role_permissions")
      .where({ role_id: roleId, permission_id: permissionId })
      .first()

    if (existing) {
      return existing
    }

    // Create new mapping
    const [rolePermission] = await db("role_permissions")
      .insert({ role_id: roleId, permission_id: permissionId })
      .returning("*")

    return rolePermission
  },

  /**
   * Remove a permission from a role
   * @param {string} roleId - Role ID
   * @param {string} permissionId - Permission ID
   * @returns {Promise<number>} - Number of rows affected
   */
  removePermissionFromRole: async (roleId, permissionId) => {
    return await db("role_permissions")
      .where({ role_id: roleId, permission_id: permissionId })
      .delete()
  }
}

module.exports = Role
