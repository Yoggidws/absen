const express = require("express")
const router = express.Router()
const {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  assignRoleToUser,
  removeRoleFromUser,
  getUserRoles,
  bulkAssignRoles,
  getRoleStats,
} = require("../controllers/roleController")

const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")

// Apply authentication to all routes
router.use(enhancedProtect)

// ============================================================================
// ROLE MANAGEMENT ROUTES
// ============================================================================

/**
 * @route   GET /api/roles
 * @desc    Get all roles with optional filters
 * @access  Private/Admin
 * @query   includePermissions - Include permissions in response (default: true)
 * @query   includeSystemRoles - Include system roles (default: true)
 */
router.get("/", rbac.can("read:role"), getAllRoles)

/**
 * @route   GET /api/roles/stats
 * @desc    Get role and permission statistics
 * @access  Private/Admin
 */
router.get("/stats", rbac.can("read:role"), getRoleStats)

/**
 * @route   POST /api/roles
 * @desc    Create a new role
 * @access  Private/Admin
 * @body    { name, display_name, description, permissions[] }
 */
router.post("/", rbac.can("create:role"), createRole)

/**
 * @route   POST /api/roles/bulk-assign
 * @desc    Bulk assign roles to users
 * @access  Private/Admin
 * @body    { assignments: [{ userId, roleIds[] }] }
 */
router.post("/bulk-assign", rbac.can("update:user_role"), bulkAssignRoles)

/**
 * @route   GET /api/roles/:id
 * @desc    Get role by ID with detailed information
 * @access  Private/Admin
 */
router.get("/:id", rbac.can("read:role"), getRoleById)

/**
 * @route   PUT /api/roles/:id
 * @desc    Update role
 * @access  Private/Admin
 * @body    { display_name, description, permissions[] }
 */
router.put("/:id", rbac.can("update:role"), updateRole)

/**
 * @route   DELETE /api/roles/:id
 * @desc    Delete role (cannot delete system roles or roles with users)
 * @access  Private/Admin
 */
router.delete("/:id", rbac.can("delete:role"), deleteRole)

// ============================================================================
// ROLE-USER ASSIGNMENT ROUTES
// ============================================================================

/**
 * @route   POST /api/roles/:roleId/users/:userId
 * @desc    Assign role to user
 * @access  Private/Admin
 */
router.post("/:roleId/users/:userId", rbac.can("update:user_role"), assignRoleToUser)

/**
 * @route   DELETE /api/roles/:roleId/users/:userId
 * @desc    Remove role from user
 * @access  Private/Admin
 */
router.delete("/:roleId/users/:userId", rbac.can("update:user_role"), removeRoleFromUser)

// ============================================================================
// USER ROLE INFORMATION ROUTES
// ============================================================================

/**
 * @route   GET /api/users/:userId/roles
 * @desc    Get user roles and permissions
 * @access  Private/Admin or Own Profile
 */
router.get("/users/:userId/roles", 
  rbac.ownOrDepartment("read:user_role", "user"),
  getUserRoles
)

module.exports = router 