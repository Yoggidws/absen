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
   * @returns {Promise<Object>} - Created user object
   */
  create: async (userData) => {
    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(userData.password, salt)

    // Generate a unique ID for the user
    const userId = userData.id || "EMP-" + Math.random().toString(36).substring(2, 10).toUpperCase()

    // Insert user
    await db("users").insert({
      id: userId,
      name: userData.name,
      email: userData.email,
      password: hashedPassword,
      role: userData.role || "employee",
      department: userData.department,
      position: userData.position,
      avatar: userData.avatar,
      active: userData.active !== undefined ? userData.active : true,
    })

    return await User.findById(userId)
  },

  /**
   * Update a user
   * @param {string} id - User ID
   * @param {Object} userData - User data to update
   * @returns {Promise<Object>} - Updated user object
   */
  update: async (id, userData) => {
    const updateData = { ...userData }

    // Hash password if provided
    if (updateData.password) {
      const salt = await bcrypt.genSalt(10)
      updateData.password = await bcrypt.hash(updateData.password, salt)
    }

    // Update user
    await db("users").where({ id }).update(updateData)

    // Return updated user
    return await User.findById(id)
  },

  /**
   * Delete a user
   * @param {string} id - User ID
   * @returns {Promise<boolean>} - Success status
   */
  delete: async (id) => {
    const deleted = await db("users").where({ id }).delete()

    return deleted > 0
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
