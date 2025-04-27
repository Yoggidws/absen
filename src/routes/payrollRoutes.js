const express = require("express")
const router = express.Router()
const {
  generatePayroll,
  getPayrollPeriods,
  getPayrollPeriodById,
  updatePayrollPeriodStatus,
  getMyPayslips,
  getPayslipById,
  generatePayslipPDF,
  updatePayrollItem,
  sendPayslipsByEmail,
} = require("../controllers/payrollController")
const { protect, admin } = require("../middlewares/authMiddleware")

// Protected routes for employees
router.get("/my-payslips", protect, getMyPayslips)
router.get("/payslips/:id", protect, getPayslipById)
router.get("/payslips/:id/pdf", protect, generatePayslipPDF)

// Admin routes
router.post("/generate", protect, admin, generatePayroll)
router.get("/periods", protect, admin, getPayrollPeriods)
router.get("/periods/:id", protect, admin, getPayrollPeriodById)
router.put("/periods/:id", protect, admin, updatePayrollPeriodStatus)
router.put("/payslips/:id", protect, admin, updatePayrollItem)
router.post("/periods/:id/send-payslips", protect, admin, sendPayslipsByEmail)

module.exports = router
