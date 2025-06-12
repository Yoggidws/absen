const express = require("express")
const router = express.Router()
const {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats,
} = require("../controllers/employeeController")
const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")

// Manage all employees (HR/Admin)
router
  .route("/")
  .post(enhancedProtect, rbac.can("create:user"), createEmployee)
  .get(enhancedProtect, rbac.can("read:user"), getAllEmployees)

// Get employee statistics (HR/Admin)
router
    .route("/stats")
    .get(enhancedProtect, rbac.can("read:user"), getEmployeeStats)

// Manage a specific employee (HR/Admin)
router
  .route("/:id")
  .get(enhancedProtect, rbac.can("read:user"), getEmployeeById)
  .put(enhancedProtect, rbac.can("update:user"), updateEmployee)
  .delete(enhancedProtect, rbac.can("delete:user"), deleteEmployee)

module.exports = router
