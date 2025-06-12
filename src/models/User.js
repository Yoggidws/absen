const { db } = require("../config/db")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")

const User = {
  /**
   * Find a user by ID
   * @param {string} id - User ID
   * @returns {Promise<Object>} - User object
   */
  findById: async (id) => {
    return await db("users").where({ id }).first()
  },

  /**
   * Find a user by email
   * @param {string} email - User email
   * @returns {Promise<Object>} - User object
   */
  findByEmail: async (email) => {
    return await db("users").where({ email }).first()
  },

  /**
   * Find a user by email with password
   * @param {string} email - User email
   * @returns {Promise<Object>} - User object with password
   */
  findByEmailWithPassword: async (email) => {
    return await db("users").where({ email }).first()
  },

  /**
   * Find a user by reset password token
   * @param {string} resetPasswordToken - Reset password token
   * @returns {Promise<Object>} - User object
   */
  findByResetToken: async (resetPasswordToken) => {
    return await db("users")
      .where({ reset_password_token: resetPasswordToken })
      .where("reset_password_expire", ">", new Date())
      .first()
  },

  /**
   * Get all users with optional filtering
   * @param {Object} filter - Filter criteria
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Array>} - Array of user objects
   */
  findAll: async (filter = {}, page = 1, limit = 10) => {
    const offset = (page - 1) * limit

    // Base query
    const baseQuery = db("users")

    // Filter by department
    if (filter.department) {
      baseQuery.where("department", filter.department)
    }

    // Filter by role
    if (filter.role) {
      baseQuery.where("role", filter.role)
    }

    // Filter by active status
    if (filter.active !== undefined) {
      baseQuery.where("active", filter.active)
    }

    // Search by name or email
    if (filter.search) {
      baseQuery.where(function () {
        this.where("name", "ilike", `%${filter.search}%`).orWhere("email", "ilike", `%${filter.search}%`)
      })
    }

    // Total count (tanpa limit/offset)
    const countQuery = baseQuery.clone()
    const { count } = await countQuery.count("id").first()

    // Get paginated users
    const users = await baseQuery.clone().offset(offset).limit(limit).select("*")

    return {
      users,
      total: Number(count),
      page,
      limit,
    }
  },

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {Array<string>} roles - Array of role IDs to assign
   * @returns {Promise<Object>} - Created user object
   */
  create: async (userData, roles = ["role_employee"]) => {
    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(userData.password, salt)

    // Map legacy role to role ID
    let legacyRoleId = null
    if (userData.role) {
      switch (userData.role) {
        case "admin":
          legacyRoleId = "role_admin"
          break
        case "manager":
          legacyRoleId = "role_manager"
          break
        case "hr":
          legacyRoleId = "role_hr"
          break
        case "payroll":
          legacyRoleId = "role_payroll"
          break
        case "hr_manager":
          legacyRoleId = "role_hr_manager"
          break
        default:
          legacyRoleId = "role_employee"
      }
    }

    // Start a transaction
    return await db.transaction(async (trx) => {
      // Insert user - include id if provided
      const insertData = {
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
        role: userData.role || "employee", // Keep for backward compatibility
        department: userData.department,
        position: userData.position,
        avatar: userData.avatar,
        active: userData.active !== undefined ? userData.active : true,
        phone: userData.phone,
        emergency_contact: userData.emergencyContact,
        address: userData.address,
      }

      // Include id if provided in userData
      if (userData.id) {
        insertData.id = userData.id
      }

      const [userId] = await trx("users").insert(insertData).returning("id")

      // Assign roles to user, ensuring no duplicates
      if (roles && roles.length > 0) {
        // Remove duplicates and ensure the legacy role is not duplicated
        const uniqueRoles = [...new Set(roles)].filter(roleId =>
          legacyRoleId ? roleId !== legacyRoleId : true
        )

        // Only add roles if there are any left after filtering
        if (uniqueRoles.length > 0) {
          const userRoles = uniqueRoles.map(roleId => ({
            user_id: userId,
            role_id: roleId
          }))
          await trx("user_roles").insert(userRoles)
        }
      }

      // Return the created user
      return await User.findById(userId)
    })
  },

  /**
   * Update a user
   * @param {string} id - User ID
   * @param {Object} userData - User data to update
   * @param {Array<string>} roles - Array of role IDs to assign (optional)
   * @returns {Promise<Object>} - Updated user object
   */
  update: async (id, userData, roles = null) => {
    const updateData = { ...userData }

    // Hash password if provided
    if (updateData.password) {
      const salt = await bcrypt.genSalt(10)
      updateData.password = await bcrypt.hash(updateData.password, salt)
    }

    // Start a transaction
    return await db.transaction(async (trx) => {
      // Update user with explicit field mapping
      await trx("users")
        .where({ id })
        .update({
          name: updateData.name,
          email: updateData.email,
          password: updateData.password,
          role: updateData.role,
          department: updateData.department,
          position: updateData.position,
          active: updateData.active,
          phone: updateData.phone,
          emergency_contact: updateData.emergencyContact,
          address: updateData.address,
          updated_at: new Date(),
        })

      // Update roles if provided
      if (roles !== null) {
        // Delete existing role assignments
        await trx("user_roles").where({ user_id: id }).delete()

        // Add new role assignments if any are provided
        if (roles && roles.length > 0) {
          const userRoles = roles.map(roleId => ({
            user_id: id,
            role_id: roleId
          }))
          await trx("user_roles").insert(userRoles)
        }
      }

      // Return updated user
      return await User.findById(id)
    })
  },

  /**
   * Delete a user
   * @param {string} id - User ID
   * @returns {Promise<boolean>} - Success status
   */
  delete: async (id) => {
    return await db.transaction(async (trx) => {
      // Delete user roles first (should cascade, but just to be safe)
      await trx("user_roles").where({ user_id: id }).delete()

      // Delete user
      const deleted = await trx("users").where({ id }).delete()

      return deleted > 0
    })
  },

  /**
   * Get user roles
   * @param {string} id - User ID
   * @returns {Promise<Array>} - Array of role objects
   */
  getRoles: async (id) => {
    return await db("roles")
      .join("user_roles", "roles.id", "user_roles.role_id")
      .where("user_roles.user_id", id)
      .select("roles.*")
  },

  /**
   * Get user permissions
   * @param {string} id - User ID
   * @returns {Promise<Array>} - Array of permission objects
   */
  getPermissions: async (id) => {
    return await db("permissions")
      .join("role_permissions", "permissions.id", "role_permissions.permission_id")
      .join("user_roles", "role_permissions.role_id", "user_roles.role_id")
      .where("user_roles.user_id", id)
      .select("permissions.*")
      .distinct()
  },

  /**
   * Get department statistics
   * @returns {Promise<Array>} - Department statistics
   */
  getDepartmentStats: async () => {
    return await db("users")
      .select("department")
      .count("id as count")
      .sum(db.raw("CASE WHEN active = true THEN 1 ELSE 0 END as active"))
      .sum(db.raw("CASE WHEN active = false THEN 1 ELSE 0 END as inactive"))
      .whereNotNull("department")
      .groupBy("department")
      .orderBy("count", "desc")
  },

  /**
   * Match password
   * @param {string} enteredPassword - Password to check
   * @param {string} hashedPassword - Stored hashed password
   * @returns {Promise<boolean>} - Whether passwords match
   */
  matchPassword: async (enteredPassword, hashedPassword) => {
    return await bcrypt.compare(enteredPassword, hashedPassword)
  },

  /**
   * Generate JWT token
   * @param {string} id - User ID
   * @returns {string} - JWT token
   */
  getSignedJwtToken: (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || "30d",
    })
  },
}

module.exports = User
