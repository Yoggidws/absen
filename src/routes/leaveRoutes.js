const express = require("express")
const router = express.Router()
const {
  createLeaveRequest,
  getAllLeaveRequests,
  getLeaveRequestById,
  updateLeaveRequest,
  cancelLeaveRequest,
  getLeaveBalance,
  getLeaveStats,
  getDepartmentLeave,
  getPendingApprovals,
  bulkUpdateLeaveStatus,
} = require("../controllers/leaveController")
const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")

// Get all leave requests (for HR/Admins) or own requests
router
  .route("/")
  .get(enhancedProtect, getAllLeaveRequests) // Controller handles own vs all logic based on permissions
  .post(enhancedProtect, rbac.can("create:leave_request"), createLeaveRequest)

// Get leave balance for the current user
router
    .route("/balance")
    .get(enhancedProtect, rbac.can("read:leave_request:own"), getLeaveBalance)

// Get leave statistics (for HR/Admins)
router
    .route("/stats")
    .get(enhancedProtect, rbac.can("read:leave_request:all"), getLeaveStats)

// Get leave requests for a specific department (for Managers/HR/Admins)
router
  .route("/department")
  .get(enhancedProtect, rbac.role(["Manager", "HR", "Admin"]), getDepartmentLeave)

// Get pending approvals for the current user (Manager/HR/Admin)
router
  .route("/pending-approvals")
  .get(enhancedProtect, rbac.can("approve:leave_request"), getPendingApprovals)
  
// Bulk update status (for Managers/HR/Admins)
router
    .route("/bulk-update")
    .post(enhancedProtect, rbac.can("approve:leave_request"), bulkUpdateLeaveStatus)

// Manage a specific leave request
router
  .route("/:id")
  .get(enhancedProtect, getLeaveRequestById) // Controller handles ownership/permission check
  .put(enhancedProtect, rbac.can("approve:leave_request"), updateLeaveRequest)

// Cancel a specific leave request
router
    .route("/:id/cancel")
    .put(enhancedProtect, rbac.can("cancel:leave_request"), cancelLeaveRequest)

module.exports = router
