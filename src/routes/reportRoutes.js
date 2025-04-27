const express = require("express")
const router = express.Router()
const {
  generateAttendanceReport,
  generateLeaveReport,
  generatePayrollReport,
  getAllReports,
  getReportById,
  downloadReport,
  deleteReport,
} = require("../controllers/reportController")
const { protect, admin } = require("../middlewares/authMiddleware")

// Admin routes
router.post("/attendance", protect, admin, generateAttendanceReport)
router.post("/leave", protect, admin, generateLeaveReport)
router.post("/payroll", protect, admin, generatePayrollReport)
router.get("/", protect, admin, getAllReports)
router.get("/:id", protect, admin, getReportById)
router.get("/:id/download", protect, admin, downloadReport)
router.delete("/:id", protect, admin, deleteReport)

module.exports = router
