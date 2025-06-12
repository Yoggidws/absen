const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const { logRoleChange, logAuditEvent } = require("../utils/auditLogger")
const { clearUserPermissionCache, clearAllPermissionCache } = require("../middlewares/rbacMiddleware")
const { generateId } = require("../utils/idGenerator")

/**
 * @desc    Get all roles with permissions
 * @route   GET /api/roles
 * @access  Private/Admin
 */
exports.getAllRoles = asyncHandler(async (req, res) => {
  const { includePermissions = 'true', includeSystemRoles = 'true' } = req.query

  let query = db("roles").select("*").orderBy("name", "asc")

  // Filter system roles if requested
  if (includeSystemRoles === 'false') {
    query = query.where("is_system_role", false)
  }

  const roles = await query

  // Include permissions if requested
  if (includePermissions === 'true') {
    for (const role of roles) {
      const permissions = await db("permissions as p")
        .join("role_permissions as rp", "p.id", "rp.permission_id")
        .where("rp.role_id", role.id)
        .select("p.*")
        .orderBy("p.category", "asc")
        .orderBy("p.name", "asc")

      role.permissions = permissions
    }
  }

  // Get user counts for each role
  for (const role of roles) {
    const userCount = await db("user_roles")
      .where("role_id", role.id)
      .count("user_id as count")
      .first()
    
    role.user_count = parseInt(userCount.count)
  }

  res.status(200).json({
    success: true,
    count: roles.length,
    data: roles,
  })
})

/**
 * @desc    Get role by ID with detailed information
 * @route   GET /api/roles/:id
 * @access  Private/Admin
 */
exports.getRoleById = asyncHandler(async (req, res) => {
  const { id } = req.params

  const role = await db("roles").where({ id }).first()

  if (!role) {
    res.status(404)
    throw new Error("Role not found")
  }

  // Get permissions for this role
  const permissions = await db("permissions as p")
    .join("role_permissions as rp", "p.id", "rp.permission_id")
    .where("rp.role_id", role.id)
    .select("p.*")
    .orderBy("p.category", "asc")
    .orderBy("p.name", "asc")

  // Get users with this role
  const users = await db("users as u")
    .join("user_roles as ur", "u.id", "ur.user_id")
    .where("ur.role_id", role.id)
    .select("u.id", "u.name", "u.email", "u.department", "u.position", "u.active")
    .orderBy("u.name", "asc")

  role.permissions = permissions
  role.users = users
  role.user_count = users.length

  res.status(200).json({
    success: true,
    data: role,
  })
})

/**
 * @desc    Create a new role
 * @route   POST /api/roles
 * @access  Private/Admin
 */
exports.createRole = asyncHandler(async (req, res) => {
  const { name, display_name, description, permissions = [] } = req.body

  if (!name || !display_name) {
    res.status(400)
    throw new Error("Role name and display name are required")
  }

  // Check if role already exists
  const existingRole = await db("roles").where({ name }).first()
  if (existingRole) {
    res.status(400)
    throw new Error("Role with this name already exists")
  }

  // Generate unique role ID
  const roleId = `role_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`

  await db.transaction(async (trx) => {
    // Create role
    const [role] = await trx("roles")
      .insert({
        id: roleId,
        name: name.toLowerCase(),
        display_name,
        description,
        is_system_role: false,
      })
      .returning("*")

    // Assign permissions if provided
    if (permissions.length > 0) {
      const rolePermissions = permissions.map(permissionId => ({
        role_id: roleId,
        permission_id: permissionId
      }))

      await trx("role_permissions").insert(rolePermissions)
    }

    // Audit log
    await logRoleChange(null, req.user.id, roleId, 'create')

    res.status(201).json({
      success: true,
      data: role,
    })
  })
})

/**
 * @desc    Update role
 * @route   PUT /api/roles/:id
 * @access  Private/Admin
 */
exports.updateRole = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { display_name, description, permissions } = req.body

  const role = await db("roles").where({ id }).first()

  if (!role) {
    res.status(404)
    throw new Error("Role not found")
  }

  // Prevent modification of system roles
  if (role.is_system_role) {
    res.status(400)
    throw new Error("Cannot modify system roles")
  }

  await db.transaction(async (trx) => {
    // Update role
    const [updatedRole] = await trx("roles")
      .where({ id })
      .update({
        display_name: display_name || role.display_name,
        description: description !== undefined ? description : role.description,
        updated_at: trx.fn.now(),
      })
      .returning("*")

    // Update permissions if provided
    if (permissions !== undefined) {
      // Remove existing permissions
      await trx("role_permissions").where({ role_id: id }).delete()

      // Add new permissions
      if (permissions.length > 0) {
        const rolePermissions = permissions.map(permissionId => ({
          role_id: id,
          permission_id: permissionId
        }))

        await trx("role_permissions").insert(rolePermissions)
      }

      // Clear cache for all users with this role
      const usersWithRole = await trx("user_roles").where({ role_id: id }).select("user_id")
      usersWithRole.forEach(ur => clearUserPermissionCache(ur.user_id))
    }

    // Audit log
    await logRoleChange(null, req.user.id, id, 'update')

    res.status(200).json({
      success: true,
      data: updatedRole,
    })
  })
})

/**
 * @desc    Delete role
 * @route   DELETE /api/roles/:id
 * @access  Private/Admin
 */
exports.deleteRole = asyncHandler(async (req, res) => {
  const { id } = req.params

  const role = await db("roles").where({ id }).first()

  if (!role) {
    res.status(404)
    throw new Error("Role not found")
  }

  // Prevent deletion of system roles
  if (role.is_system_role) {
    res.status(400)
    throw new Error("Cannot delete system roles")
  }

  // Check if role has users assigned
  const userCount = await db("user_roles")
    .where({ role_id: id })
    .count("user_id as count")
    .first()

  if (parseInt(userCount.count) > 0) {
    res.status(400)
    throw new Error("Cannot delete role with assigned users. Remove users first.")
  }

  await db.transaction(async (trx) => {
    // Delete role permissions
    await trx("role_permissions").where({ role_id: id }).delete()

    // Delete role
    await trx("roles").where({ id }).delete()

    // Audit log
    await logRoleChange(null, req.user.id, id, 'delete')
  })

  res.status(200).json({
    success: true,
    message: "Role deleted successfully",
  })
})

/**
 * @desc    Assign role to user
 * @route   POST /api/roles/:roleId/users/:userId
 * @access  Private/Admin
 */
exports.assignRoleToUser = asyncHandler(async (req, res) => {
  const { roleId, userId } = req.params

  // Verify role exists
  const role = await db("roles").where({ id: roleId }).first()
  if (!role) {
    res.status(404)
    throw new Error("Role not found")
  }

  // Verify user exists
  const user = await db("users").where({ id: userId }).first()
  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Check if assignment already exists
  const existingAssignment = await db("user_roles")
    .where({ user_id: userId, role_id: roleId })
    .first()

  if (existingAssignment) {
    res.status(400)
    throw new Error("User already has this role")
  }

  // Create assignment
  await db("user_roles").insert({
    user_id: userId,
    role_id: roleId,
  })

  // Clear user's permission cache
  clearUserPermissionCache(userId)

  // Audit log
  await logRoleChange(userId, req.user.id, roleId, 'assign')

  res.status(200).json({
    success: true,
    message: `Role ${role.display_name} assigned to user successfully`,
  })
})

/**
 * @desc    Remove role from user
 * @route   DELETE /api/roles/:roleId/users/:userId
 * @access  Private/Admin
 */
exports.removeRoleFromUser = asyncHandler(async (req, res) => {
  const { roleId, userId } = req.params

  // Verify assignment exists
  const assignment = await db("user_roles")
    .where({ user_id: userId, role_id: roleId })
    .first()

  if (!assignment) {
    res.status(404)
    throw new Error("Role assignment not found")
  }

  // Verify user has at least one other role (prevent lockout)
  const userRoles = await db("user_roles")
    .where({ user_id: userId })
    .count("role_id as count")
    .first()

  if (parseInt(userRoles.count) <= 1) {
    res.status(400)
    throw new Error("Cannot remove last role from user")
  }

  // Remove assignment
  await db("user_roles")
    .where({ user_id: userId, role_id: roleId })
    .delete()

  // Clear user's permission cache
  clearUserPermissionCache(userId)

  // Audit log
  await logRoleChange(userId, req.user.id, roleId, 'remove')

  res.status(200).json({
    success: true,
    message: "Role removed from user successfully",
  })
})

/**
 * @desc    Get user roles and permissions
 * @route   GET /api/users/:userId/roles
 * @access  Private/Admin
 */
exports.getUserRoles = asyncHandler(async (req, res) => {
  const { userId } = req.params

  // Verify user exists
  const user = await db("users").where({ id: userId }).select("id", "name", "email").first()
  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Get user roles
  const roles = await db("roles as r")
    .join("user_roles as ur", "r.id", "ur.role_id")
    .where("ur.user_id", userId)
    .select("r.*")
    .orderBy("r.name", "asc")

  // Get user permissions (through roles)
  const permissions = await db("permissions as p")
    .join("role_permissions as rp", "p.id", "rp.permission_id")
    .join("user_roles as ur", "rp.role_id", "ur.role_id")
    .where("ur.user_id", userId)
    .select("p.*")
    .distinct()
    .orderBy("p.category", "asc")
    .orderBy("p.name", "asc")

  res.status(200).json({
    success: true,
    data: {
      user,
      roles,
      permissions,
      role_count: roles.length,
      permission_count: permissions.length,
    },
  })
})

/**
 * @desc    Bulk assign roles to users
 * @route   POST /api/roles/bulk-assign
 * @access  Private/Admin
 */
exports.bulkAssignRoles = asyncHandler(async (req, res) => {
  const { assignments } = req.body // Array of { userId, roleIds }

  if (!assignments || !Array.isArray(assignments)) {
    res.status(400)
    throw new Error("Assignments array is required")
  }

  const results = []

  await db.transaction(async (trx) => {
    for (const assignment of assignments) {
      const { userId, roleIds } = assignment

      if (!userId || !roleIds || !Array.isArray(roleIds)) {
        results.push({
          userId,
          success: false,
          error: "Invalid assignment format"
        })
        continue
      }

      try {
        // Verify user exists
        const user = await trx("users").where({ id: userId }).first()
        if (!user) {
          results.push({
            userId,
            success: false,
            error: "User not found"
          })
          continue
        }

        // Remove existing roles
        await trx("user_roles").where({ user_id: userId }).delete()

        // Add new roles
        const userRoles = roleIds.map(roleId => ({
          user_id: userId,
          role_id: roleId
        }))

        await trx("user_roles").insert(userRoles)

        // Clear user cache
        clearUserPermissionCache(userId)

        // Audit log
        for (const roleId of roleIds) {
          await logRoleChange(userId, req.user.id, roleId, 'bulk_assign')
        }

        results.push({
          userId,
          success: true,
          rolesAssigned: roleIds.length
        })

      } catch (error) {
        results.push({
          userId,
          success: false,
          error: error.message
        })
      }
    }
  })

  res.status(200).json({
    success: true,
    message: "Bulk role assignment completed",
    results,
  })
})

/**
 * @desc    Get role statistics
 * @route   GET /api/roles/stats
 * @access  Private/Admin
 */
exports.getRoleStats = asyncHandler(async (req, res) => {
  // Role counts
  const totalRoles = await db("roles").count("id as count").first()
  const systemRoles = await db("roles").where({ is_system_role: true }).count("id as count").first()
  const customRoles = await db("roles").where({ is_system_role: false }).count("id as count").first()

  // Permission counts
  const totalPermissions = await db("permissions").count("id as count").first()
  
  // Permission categories
  const permissionsByCategory = await db("permissions")
    .select("category")
    .count("id as count")
    .groupBy("category")
    .orderBy("count", "desc")

  // Role assignments
  const roleAssignments = await db("roles as r")
    .leftJoin("user_roles as ur", "r.id", "ur.role_id")
    .select("r.name", "r.display_name")
    .count("ur.user_id as user_count")
    .groupBy("r.id", "r.name", "r.display_name")
    .orderBy("user_count", "desc")

  // Users without roles
  const usersWithoutRoles = await db.raw(`
    SELECT COUNT(*) as count
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    WHERE ur.user_id IS NULL AND u.active = true
  `)

  res.status(200).json({
    success: true,
    data: {
      roles: {
        total: parseInt(totalRoles.count),
        system: parseInt(systemRoles.count),
        custom: parseInt(customRoles.count)
      },
      permissions: {
        total: parseInt(totalPermissions.count),
        by_category: permissionsByCategory
      },
      assignments: roleAssignments,
      users_without_roles: parseInt(usersWithoutRoles.rows[0].count)
    },
  })
}) 