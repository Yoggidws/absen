const express = require("express")
const router = express.Router()
const {
  generateQRCode,
  scanQRCode,
  getAttendanceHistory,
  getAttendanceSummary,
  getAttendanceStats,
} = require("../controllers/attendanceController")
const { protect, admin } = require("../middlewares/authMiddleware")

// Protected routes
router.get("/qrcode", protect, admin, generateQRCode)
router.post("/scan", protect, scanQRCode)
router.get("/history", protect, getAttendanceHistory)
router.get("/history/:userId", protect, getAttendanceHistory)
router.get("/summary", protect, getAttendanceSummary)
router.get("/summary/:userId", protect, getAttendanceSummary)

// Admin routes
router.get("/stats", protect, admin, getAttendanceStats)

module.exports = router
