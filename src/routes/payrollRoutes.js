const express = require("express")
const router = express.Router()
const {
  // --- Employee-facing ---
  getMyPayslips,
  getPayslipById,
  generatePayslipPDF,
  getEmployeePayroll, // Alias for my-payslips for consistency
  
  // --- Admin/Payroll-facing ---
  createPayrollPeriod,
  getAllPayrollPeriods,
  getPayrollPeriodById,
  updatePayrollPeriod,
  deletePayrollPeriod,
  runPayroll,
  getPayrollItems,
  getPayrollItemById,
  updatePayrollItem,
  getPayrollStats,
  sendPayslipsByEmail,
} = require("../controllers/payrollController")
const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")


// =================================================================
//                 EMPLOYEE-FACING ROUTES
// =================================================================

// Get all of the current user's payslips (summary view)
router
  .route("/my-payslips")
  .get(enhancedProtect, rbac.can("read:payroll:own"), getMyPayslips)

// Get all of the current user's payroll data (detailed view)
router
  .route("/my-payroll")
  .get(enhancedProtect, rbac.can("read:payroll:own"), getEmployeePayroll)

// Get a specific payslip and download it as a PDF
router
  .route("/payslips/:id")
  .get(enhancedProtect, rbac.can("read:payroll:own"), getPayslipById)

router
  .route("/payslips/:id/pdf")
  .get(enhancedProtect, rbac.can("read:payroll:own"), generatePayslipPDF)


// =================================================================
//                 ADMIN & PAYROLL ROUTES
// =================================================================

// Manage payroll periods
router
  .route("/periods")
  .post(enhancedProtect, rbac.can("manage:payroll"), createPayrollPeriod)
  .get(enhancedProtect, rbac.can("read:payroll:all"), getAllPayrollPeriods)

router
  .route("/periods/:id")
  .get(enhancedProtect, rbac.can("read:payroll:all"), getPayrollPeriodById)
  .put(enhancedProtect, rbac.can("manage:payroll"), updatePayrollPeriod)
  .delete(enhancedProtect, rbac.can("manage:payroll"), deletePayrollPeriod)

// Run payroll for a period
router
    .route("/run/:periodId")
    .post(enhancedProtect, rbac.can("manage:payroll"), runPayroll)
    
// Send payslips for a period via email
router
    .route("/periods/:id/send-payslips")
    .post(enhancedProtect, rbac.can("manage:payroll"), sendPayslipsByEmail)

// Get all payroll items for a period
router
    .route("/items/:periodId")
    .get(enhancedProtect, rbac.can("read:payroll:all"), getPayrollItems)

// Manage a specific payroll item (for adjustments)
router
  .route("/item/:id")
  .get(enhancedProtect, rbac.can("read:payroll:all"), getPayrollItemById)
  .put(enhancedProtect, rbac.can("manage:payroll"), updatePayrollItem)

// Get overall payroll statistics
router
    .route("/stats")
    .get(enhancedProtect, rbac.can("read:payroll:all"), getPayrollStats)

module.exports = router
