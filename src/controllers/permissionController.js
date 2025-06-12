const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const { logAuditEvent } = require("../utils/auditLogger")
const { clearAllPermissionCache } = require("../middlewares/rbacMiddleware")

/**
 * @desc    Get all permissions grouped by category
 * @route   GET /api/permissions
 * @access  Private/Admin
 */
exports.getAllPermissions = asyncHandler(async (req, res) => {
  const permissions = await db("permissions")
    .select("*")
    .orderBy("category", "asc")
    .orderBy("name", "asc")

  // Group by category
  const groupedPermissions = permissions.reduce((acc, permission) => {
    const category = permission.category || 'uncategorized'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(permission)
    return acc
  }, {})

  res.status(200).json({
    success: true,
    count: permissions.length,
    data: permissions,
    grouped: groupedPermissions,
  })
})

/**
 * @desc    Create a new permission
 * @route   POST /api/permissions
 * @access  Private/Admin
 */
exports.createPermission = asyncHandler(async (req, res) => {
  const { name, description, category } = req.body

  if (!name) {
    res.status(400)
    throw new Error("Permission name is required")
  }

  // Check if permission already exists
  const existingPermission = await db("permissions").where({ name }).first()
  if (existingPermission) {
    res.status(400)
    throw new Error("Permission with this name already exists")
  }

  // Generate unique permission ID
  const permissionId = `perm_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`

  const [permission] = await db("permissions")
    .insert({
      id: permissionId,
      name,
      description,
      category: category || 'custom',
    })
    .returning("*")

  // Audit log
  await logAuditEvent({
    action: 'create_permission',
    user_id: req.user.id,
    resource: 'permission',
    resource_id: permissionId,
    details: { name, description, category }
  })

  res.status(201).json({
    success: true,
    data: permission,
  })
})

/**
 * @desc    Update permission
 * @route   PUT /api/permissions/:id
 * @access  Private/Admin
 */
exports.updatePermission = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { description, category } = req.body

  const permission = await db("permissions").where({ id }).first()

  if (!permission) {
    res.status(404)
    throw new Error("Permission not found")
  }

  const [updatedPermission] = await db("permissions")
    .where({ id })
    .update({
      description: description !== undefined ? description : permission.description,
      category: category !== undefined ? category : permission.category,
      updated_at: db.fn.now(),
    })
    .returning("*")

  // Clear all permission cache since permission was updated
  clearAllPermissionCache()

  // Audit log
  await logAuditEvent({
    action: 'update_permission',
    user_id: req.user.id,
    resource: 'permission',
    resource_id: id,
    details: { description, category }
  })

  res.status(200).json({
    success: true,
    data: updatedPermission,
  })
})

/**
 * @desc    Delete permission
 * @route   DELETE /api/permissions/:id
 * @access  Private/Admin
 */
exports.deletePermission = asyncHandler(async (req, res) => {
  const { id } = req.params

  const permission = await db("permissions").where({ id }).first()

  if (!permission) {
    res.status(404)
    throw new Error("Permission not found")
  }

  // Check if permission is assigned to any roles
  const roleCount = await db("role_permissions")
    .where({ permission_id: id })
    .count("role_id as count")
    .first()

  if (parseInt(roleCount.count) > 0) {
    res.status(400)
    throw new Error("Cannot delete permission assigned to roles. Remove from roles first.")
  }

  await db("permissions").where({ id }).delete()

  // Clear all permission cache
  clearAllPermissionCache()

  // Audit log
  await logAuditEvent({
    action: 'delete_permission',
    user_id: req.user.id,
    resource: 'permission',
    resource_id: id,
    details: { name: permission.name }
  })

  res.status(200).json({
    success: true,
    message: "Permission deleted successfully",
  })
}) 