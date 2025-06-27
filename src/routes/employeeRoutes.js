const express = require("express")
const router = express.Router()
const {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getEmployeeStats,
  getEmployeeLeaveBalance,
  getAllEmployeesLeaveBalances,
  bulkInitializeLeaveBalances,
  recalculateEmployeeLeaveBalance,
  getLeaveBalanceStatistics,
  getOnboardingEmployees,
  getOffboardingEmployees,
  adjustLeaveBalance
} = require("../controllers/employeeController")
const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")
const { requireRole } = require("../middlewares/rbacMiddleware")

// Onboarding and offboarding routes (must come before /:id routes)
router.route("/onboarding")
  .get(enhancedProtect, requireRole(["admin", "hr"]), getOnboardingEmployees)

router.route("/offboarding")
  .get(enhancedProtect, requireRole(["admin", "hr"]), getOffboardingEmployees)

// Leave balance routes (must come before /:id routes)
router.route("/leave-balances")
  .get(enhancedProtect, requireRole(["admin", "hr"]), getAllEmployeesLeaveBalances)

router.route("/leave-balances/initialize")
  .post(enhancedProtect, requireRole(["admin", "hr"]), bulkInitializeLeaveBalances)

router.route("/leave-balance-stats")
  .get(enhancedProtect, requireRole(["admin", "hr"]), getLeaveBalanceStatistics)

// Get employee statistics (HR/Admin)
router.route("/stats")
  .get(enhancedProtect, rbac.can("read:user"), getEmployeeStats)

// Manage all employees (HR/Admin)
router.route("/")
  .post(enhancedProtect, rbac.can("create:user"), createEmployee)
  .get(enhancedProtect, rbac.can("read:user"), getAllEmployees)

// Individual employee routes (must come after other specific routes)
router.route("/:id/leave-balance")
  .get(enhancedProtect, getEmployeeLeaveBalance)

router.route("/:id/leave-balance/recalculate")
  .post(enhancedProtect, requireRole(["admin", "hr"]), recalculateEmployeeLeaveBalance)

router.route("/:id/leave-balance/adjust")
    .post(enhancedProtect, requireRole(["admin", "hr"]), adjustLeaveBalance)

router.route("/:id")
  .get(enhancedProtect, rbac.can("read:user"), getEmployeeById)
  .put(enhancedProtect, rbac.can("update:user"), updateEmployee)
  .delete(enhancedProtect, rbac.can("delete:user"), deleteEmployee)

module.exports = router
