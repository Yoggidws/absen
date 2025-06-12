const express = require("express")
const router = express.Router()
const {
  getAllPermissions,
  createPermission,
  updatePermission,
  deletePermission,
} = require("../controllers/permissionController")

const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")

// Apply authentication to all routes
router.use(enhancedProtect)

// ============================================================================
// PERMISSION MANAGEMENT ROUTES
// ============================================================================

/**
 * @route   GET /api/permissions
 * @desc    Get all permissions grouped by category
 * @access  Private/Admin
 */
router.get("/", rbac.can("read:permission"), getAllPermissions)

/**
 * @route   POST /api/permissions
 * @desc    Create a new permission
 * @access  Private/Admin
 * @body    { name, description, category }
 */
router.post("/", rbac.can("create:permission"), createPermission)

/**
 * @route   PUT /api/permissions/:id
 * @desc    Update permission
 * @access  Private/Admin
 * @body    { description, category }
 */
router.put("/:id", rbac.can("update:permission"), updatePermission)

/**
 * @route   DELETE /api/permissions/:id
 * @desc    Delete permission (cannot delete if assigned to roles)
 * @access  Private/Admin
 */
router.delete("/:id", rbac.can("delete:permission"), deletePermission)

module.exports = router 