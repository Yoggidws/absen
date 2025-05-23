const express = require("express")
const router = express.Router()
const {
  createLeaveRequest,
  getLeaveRequests,
  getLeaveRequestById,
  updateLeaveRequestStatus,
  cancelLeaveRequest,
  getPendingApprovals,
  getLeaveStatistics,
  getLeaveBalance,
  getDepartmentOverview,
  getLeaveApprovalWorkflow,
  getAllLeaveBalances,
  adjustLeaveBalance
} = require("../controllers/leaveController")
const { protect, admin } = require("../middlewares/authMiddleware")

// Protected routes
router.post("/", protect, createLeaveRequest)
router.get("/", protect, getLeaveRequests)
router.get("/pending-approval", protect, getPendingApprovals)
router.get("/stats", protect, admin, getLeaveStatistics)
router.get("/balance", protect, getLeaveBalance)
router.get("/department-overview", protect, getDepartmentOverview)
// These routes with parameters must come after the specific routes
router.get("/:id", protect, getLeaveRequestById)
router.get("/:id/workflow", protect, getLeaveApprovalWorkflow)
router.put("/:id", protect, updateLeaveRequestStatus)
router.put("/:id/cancel", protect, cancelLeaveRequest)

// Admin routes
router.get("/balances/all", protect, admin, getAllLeaveBalances)
router.post("/balance/adjust", protect, admin, adjustLeaveBalance)

module.exports = router
