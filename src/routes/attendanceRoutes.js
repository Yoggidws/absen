const express = require("express")
const router = express.Router()
const {
  generateQRCode,
  scanQRCode,
  getAttendanceHistory,
  getAttendanceSummary,
  getAttendanceStats,
  getDashboardStats,
} = require("../controllers/attendanceController")
const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")

// Test endpoint to debug permissions
router.get("/test-auth", enhancedProtect, (req, res) => {
  res.json({
    success: true,
    user: {
      ...req.user,
      ...req.authData,
      effectiveRoles: req.effectiveRoles,
    },
  })
})

// Test endpoint without permission check
router.get("/test-history", enhancedProtect, getAttendanceHistory)

// Generate QR code (admin/manager with permission)
router.get("/qrcode", enhancedProtect, rbac.can("manage:attendance"), generateQRCode)

// Scan QR code (all authenticated users)
router.post("/scan", enhancedProtect, scanQRCode)

// Get attendance history for all users (admin/hr with permission)
router.get("/history/all", enhancedProtect, rbac.can("read:attendance:all"), getAttendanceHistory)

// Get attendance history for a specific user (admin/hr or user themselves)
router.get(
  "/history/:userId",
  enhancedProtect,
  rbac.anyOf(["read:attendance:all", "read:attendance:own"]),
  getAttendanceHistory
)

// Get own attendance history (requires permission to read own attendance)
router.get("/history", enhancedProtect, rbac.can("read:attendance:own"), getAttendanceHistory)

// Get attendance summary for a specific user (admin/hr or user themselves)
router.get(
  "/summary/:userId",
  enhancedProtect,
  rbac.anyOf(["read:attendance:all", "read:attendance:own"]),
  getAttendanceSummary
)

// Get own attendance summary
router.get("/summary", enhancedProtect, rbac.can("read:attendance:own"), getAttendanceSummary)

// Get overall attendance statistics (admin/hr with permission)
router.get("/stats", enhancedProtect, rbac.can("read:attendance:all"), getAttendanceStats)

// Get dashboard statistics (all authenticated users)
router.get("/dashboard-stats", enhancedProtect, getDashboardStats)

module.exports = router
