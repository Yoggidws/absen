const express = require("express")
const router = express.Router()
const {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  getDepartmentStats,
} = require("../controllers/departmentController")
const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")

// Routes for creating and viewing departments
router
  .route("/")
  .post(enhancedProtect, rbac.can("create:department"), createDepartment)
  .get(enhancedProtect, rbac.can("read:department"), getAllDepartments)

// Route for department statistics
router
    .route("/stats")
    .get(enhancedProtect, rbac.can("read:department"), getDepartmentStats)

// Routes for specific departments
router
  .route("/:id")
  .get(enhancedProtect, rbac.can("read:department"), getDepartmentById)
  .put(enhancedProtect, rbac.can("update:department"), updateDepartment)
  .delete(enhancedProtect, rbac.can("delete:department"), deleteDepartment)

module.exports = router
