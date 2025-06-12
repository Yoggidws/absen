const express = require("express")
const router = express.Router()
const {
  generateAttendanceReport,
  generateLeaveReport,
  generatePayrollReport,
  exportPayrollReport,
  getAllReports,
  getReportById,
  downloadReport,
  deleteReport,
} = require("../controllers/reportController")
const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")

// Generate reports (HR/Admin)
router
  .route("/attendance")
  .post(enhancedProtect, rbac.can("generate:report"), generateAttendanceReport)

router
    .route("/leave")
    .post(enhancedProtect, rbac.can("generate:report"), generateLeaveReport)

router
    .route("/payroll")
    .post(enhancedProtect, rbac.can("generate:report"), generatePayrollReport)
    
router
    .route("/payroll/:periodId")
    .get(enhancedProtect, rbac.can("generate:report"), exportPayrollReport)


// Manage all reports (HR/Admin)
router
    .route("/")
    .get(enhancedProtect, rbac.can("read:report"), getAllReports)

// Manage a specific report (HR/Admin)
router
  .route("/:id")
  .get(enhancedProtect, rbac.can("read:report"), getReportById)
  .delete(enhancedProtect, rbac.can("delete:report"), deleteReport)

// Download a report file
router
    .route("/:id/download")
    .get(enhancedProtect, rbac.can("read:report"), downloadReport)


module.exports = router
