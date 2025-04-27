const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const PDFDocument = require("pdfkit")
const fs = require("fs")
const path = require("path")
const emailUtils = require("../utils/emailUtils")

/**
 * @desc    Generate payroll for a specific period
 * @route   POST /api/payroll/generate
 * @access  Private/Admin
 */
exports.generatePayroll = asyncHandler(async (req, res) => {
  const { month, year, departmentId } = req.body

  if (!month || !year) {
    res.status(400)
    throw new Error("Month and year are required")
  }

  // Validate month and year
  const monthNum = Number.parseInt(month)
  const yearNum = Number.parseInt(year)

  if (monthNum < 1 || monthNum > 12) {
    res.status(400)
    throw new Error("Month must be between 1 and 12")
  }

  // Create payroll period
  const startDate = new Date(yearNum, monthNum - 1, 1)
  const endDate = new Date(yearNum, monthNum, 0) // Last day of month

  // Format period for display
  const periodName = `${startDate.toLocaleString("default", { month: "long" })} ${yearNum}`

  // Check if payroll for this period already exists
  const existingPayroll = await db("payroll_periods").where({ month: monthNum, year: yearNum }).first()

  let payrollPeriodId

  if (existingPayroll) {
    payrollPeriodId = existingPayroll.id
  } else {
    // Generate a unique ID for the payroll period
    payrollPeriodId = "PAY-" + Math.random().toString(36).substring(2, 10).toUpperCase()

    // Create new payroll period
    const [payrollPeriod] = await db("payroll_periods")
      .insert({
        id: payrollPeriodId,
        month: monthNum,
        year: yearNum,
        name: periodName,
        start_date: startDate,
        end_date: endDate,
        status: "draft",
        created_by: req.user.id,
      })
      .returning("*")
  }

  // Get employees to process
  let employeeQuery = db("users")
    .where({ active: true })
    .whereNot({ role: "admin" }) // Exclude admin users
    .select("id", "name", "email", "department", "position")

  // Filter by department if provided
  if (departmentId) {
    const department = await db("departments").where({ id: departmentId }).first()
    if (!department) {
      res.status(404)
      throw new Error("Department not found")
    }
    employeeQuery = employeeQuery.where({ department: department.name })
  }

  const employees = await employeeQuery

  // Process each employee
  const payrollItems = []

  for (const employee of employees) {
    // Check if payroll item already exists for this employee and period
    const existingItem = await db("payroll_items")
      .where({
        user_id: employee.id,
        payroll_period_id: payrollPeriodId,
      })
      .first()

    if (existingItem) {
      // Skip if already processed
      payrollItems.push(existingItem)
      continue
    }

    // Get employee's compensation
    const compensation = await db("compensation")
      .where({ user_id: employee.id })
      .where("effective_date", "<=", endDate)
      .orderBy("effective_date", "desc")
      .first()

    if (!compensation) {
      // Skip employees without compensation records
      continue
    }

    // Get attendance for the period
    const attendance = await db("attendance")
      .where({ user_id: employee.id })
      .whereBetween("timestamp", [startDate, endDate])
      .orderBy("timestamp", "asc")

    // Calculate working days
    const workingDays = getWorkingDaysInMonth(yearNum, monthNum - 1)

    // Calculate present days
    const presentDays = calculatePresentDays(attendance)

    // Calculate leave days
    const leaves = await db("leave_requests")
      .where({ user_id: employee.id, status: "approved" })
      .where(function () {
        this.whereBetween("start_date", [startDate, endDate]).orWhereBetween("end_date", [startDate, endDate])
      })

    const leaveDays = calculateLeaveDays(leaves, startDate, endDate)

    // Calculate base salary
    const baseSalary = compensation.base_salary

    // Calculate bonuses
    let totalBonuses = 0
    if (compensation.bonuses) {
      const bonuses = JSON.parse(compensation.bonuses)
      if (Array.isArray(bonuses)) {
        totalBonuses = bonuses.reduce((sum, bonus) => sum + (Number.parseFloat(bonus.amount) || 0), 0)
      }
    }

    // Calculate deductions
    let totalDeductions = 0
    if (compensation.deductions) {
      const deductions = JSON.parse(compensation.deductions)
      if (Array.isArray(deductions)) {
        totalDeductions = deductions.reduce((sum, deduction) => sum + (Number.parseFloat(deduction.amount) || 0), 0)
      }
    }

    // Calculate attendance-based deductions (for absences)
    const absentDays = workingDays - presentDays - leaveDays.paid
    const dailyRate = baseSalary / workingDays
    const absenceDeduction = absentDays > 0 ? absentDays * dailyRate : 0

    // Calculate net salary
    const grossSalary = baseSalary + totalBonuses
    const totalDeductionsWithAbsence = totalDeductions + absenceDeduction
    const netSalary = grossSalary - totalDeductionsWithAbsence

    // Generate a unique ID for the payroll item
    const payrollItemId = "PAYITEM-" + Math.random().toString(36).substring(2, 10).toUpperCase()

    // Create payroll item
    const [payrollItem] = await db("payroll_items")
      .insert({
        id: payrollItemId,
        payroll_period_id: payrollPeriodId,
        user_id: employee.id,
        base_salary: baseSalary,
        bonuses: totalBonuses,
        deductions: totalDeductions,
        absence_deduction: absenceDeduction,
        gross_salary: grossSalary,
        net_salary: netSalary,
        working_days: workingDays,
        present_days: presentDays,
        absent_days: absentDays,
        paid_leave_days: leaveDays.paid,
        unpaid_leave_days: leaveDays.unpaid,
        status: "pending",
        currency: compensation.currency || "USD",
        details: JSON.stringify({
          compensation_id: compensation.id,
          attendance_summary: {
            workingDays,
            presentDays,
            absentDays,
            leaveDetails: leaveDays,
          },
          calculation: {
            dailyRate,
            bonusDetails: compensation.bonuses ? JSON.parse(compensation.bonuses) : [],
            deductionDetails: compensation.deductions ? JSON.parse(compensation.deductions) : [],
            absenceDeduction,
          },
        }),
      })
      .returning("*")

    payrollItems.push(payrollItem)
  }

  // Update payroll period status
  await db("payroll_periods").where({ id: payrollPeriodId }).update({
    status: "pending",
    updated_at: db.fn.now(),
  })

  res.status(200).json({
    success: true,
    message: `Payroll generated for ${periodName}`,
    data: {
      payrollPeriodId,
      periodName,
      employeeCount: payrollItems.length,
    },
  })
})

/**
 * @desc    Get all payroll periods
 * @route   GET /api/payroll/periods
 * @access  Private/Admin
 */
exports.getPayrollPeriods = asyncHandler(async (req, res) => {
  const { status, year } = req.query

  // Build query
  let query = db("payroll_periods as pp")
    .leftJoin("users as u", "pp.created_by", "u.id")
    .select(
      "pp.id",
      "pp.month",
      "pp.year",
      "pp.name",
      "pp.start_date",
      "pp.end_date",
      "pp.status",
      "pp.created_at",
      "pp.updated_at",
      "u.name as created_by_name",
    )
    .orderBy([
      { column: "pp.year", order: "desc" },
      { column: "pp.month", order: "desc" },
    ])

  // Apply filters
  if (status) {
    query = query.where("pp.status", status)
  }

  if (year) {
    query = query.where("pp.year", year)
  }

  const payrollPeriods = await query

  // Get count of employees for each period
  const periodsWithCounts = await Promise.all(
    payrollPeriods.map(async (period) => {
      const { count } = await db("payroll_items").where({ payroll_period_id: period.id }).count("id as count").first()

      return {
        ...period,
        employee_count: Number.parseInt(count, 10),
      }
    }),
  )

  res.status(200).json({
    success: true,
    count: periodsWithCounts.length,
    data: periodsWithCounts,
  })
})

/**
 * @desc    Get payroll period by ID with items
 * @route   GET /api/payroll/periods/:id
 * @access  Private/Admin
 */
exports.getPayrollPeriodById = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Get payroll period
  const payrollPeriod = await db("payroll_periods as pp")
    .leftJoin("users as u", "pp.created_by", "u.id")
    .select(
      "pp.id",
      "pp.month",
      "pp.year",
      "pp.name",
      "pp.start_date",
      "pp.end_date",
      "pp.status",
      "pp.created_at",
      "pp.updated_at",
      "u.name as created_by_name",
    )
    .where("pp.id", id)
    .first()

  if (!payrollPeriod) {
    res.status(404)
    throw new Error("Payroll period not found")
  }

  // Get payroll items
  const payrollItems = await db("payroll_items as pi")
    .join("users as u", "pi.user_id", "u.id")
    .select(
      "pi.id",
      "pi.user_id",
      "u.name as user_name",
      "u.email as user_email",
      "u.department",
      "u.position",
      "pi.base_salary",
      "pi.bonuses",
      "pi.deductions",
      "pi.absence_deduction",
      "pi.gross_salary",
      "pi.net_salary",
      "pi.working_days",
      "pi.present_days",
      "pi.absent_days",
      "pi.paid_leave_days",
      "pi.unpaid_leave_days",
      "pi.status",
      "pi.currency",
      "pi.payment_date",
      "pi.payment_method",
      "pi.payment_reference",
    )
    .where("pi.payroll_period_id", id)
    .orderBy("u.name", "asc")

  // Calculate totals
  const totals = payrollItems.reduce(
    (acc, item) => {
      acc.totalGrossSalary += Number.parseFloat(item.gross_salary) || 0
      acc.totalNetSalary += Number.parseFloat(item.net_salary) || 0
      acc.totalBonuses += Number.parseFloat(item.bonuses) || 0
      acc.totalDeductions += Number.parseFloat(item.deductions) || 0
      acc.totalAbsenceDeduction += Number.parseFloat(item.absence_deduction) || 0
      return acc
    },
    {
      totalGrossSalary: 0,
      totalNetSalary: 0,
      totalBonuses: 0,
      totalDeductions: 0,
      totalAbsenceDeduction: 0,
    },
  )

  res.status(200).json({
    success: true,
    data: {
      ...payrollPeriod,
      items: payrollItems,
      totals,
      employee_count: payrollItems.length,
    },
  })
})

/**
 * @desc    Update payroll period status
 * @route   PUT /api/payroll/periods/:id
 * @access  Private/Admin
 */
exports.updatePayrollPeriodStatus = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  if (!status) {
    res.status(400)
    throw new Error("Status is required")
  }

  // Validate status
  const validStatuses = ["draft", "pending", "approved", "paid", "cancelled"]
  if (!validStatuses.includes(status)) {
    res.status(400)
    throw new Error(`Status must be one of: ${validStatuses.join(", ")}`)
  }

  // Check if payroll period exists
  const payrollPeriod = await db("payroll_periods").where({ id }).first()
  if (!payrollPeriod) {
    res.status(404)
    throw new Error("Payroll period not found")
  }

  // Update payroll period status
  const [updatedPeriod] = await db("payroll_periods")
    .where({ id })
    .update({
      status,
      updated_at: db.fn.now(),
    })
    .returning("*")

  // If status is approved or paid, update all payroll items
  if (status === "approved" || status === "paid") {
    await db("payroll_items")
      .where({ payroll_period_id: id })
      .update({
        status,
        updated_at: db.fn.now(),
        payment_date: status === "paid" ? new Date() : null,
      })
  }

  res.status(200).json({
    success: true,
    message: `Payroll period status updated to ${status}`,
    data: updatedPeriod,
  })
})

/**
 * @desc    Get employee's payslips
 * @route   GET /api/payroll/my-payslips
 * @access  Private
 */
exports.getMyPayslips = asyncHandler(async (req, res) => {
  const userId = req.user.id

  // Get employee's payroll items
  const payslips = await db("payroll_items as pi")
    .join("payroll_periods as pp", "pi.payroll_period_id", "pp.id")
    .select(
      "pi.id",
      "pp.id as period_id",
      "pp.name as period_name",
      "pp.month",
      "pp.year",
      "pp.start_date",
      "pp.end_date",
      "pi.base_salary",
      "pi.bonuses",
      "pi.deductions",
      "pi.absence_deduction",
      "pi.gross_salary",
      "pi.net_salary",
      "pi.working_days",
      "pi.present_days",
      "pi.absent_days",
      "pi.paid_leave_days",
      "pi.unpaid_leave_days",
      "pi.status",
      "pi.currency",
      "pi.payment_date",
      "pi.payment_method",
      "pi.payment_reference",
      "pi.created_at",
    )
    .where("pi.user_id", userId)
    .orderBy([
      { column: "pp.year", order: "desc" },
      { column: "pp.month", order: "desc" },
    ])

  res.status(200).json({
    success: true,
    count: payslips.length,
    data: payslips,
  })
})

/**
 * @desc    Get payslip by ID
 * @route   GET /api/payroll/payslips/:id
 * @access  Private
 */
exports.getPayslipById = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.user.id
  const isAdmin = req.user.role === "admin"

  // Get payslip with related data
  const payslip = await db("payroll_items as pi")
    .join("payroll_periods as pp", "pi.payroll_period_id", "pp.id")
    .join("users as u", "pi.user_id", "u.id")
    .select(
      "pi.id",
      "pp.id as period_id",
      "pp.name as period_name",
      "pp.month",
      "pp.year",
      "pp.start_date",
      "pp.end_date",
      "pi.user_id",
      "u.name as user_name",
      "u.email as user_email",
      "u.department",
      "u.position",
      "pi.base_salary",
      "pi.bonuses",
      "pi.deductions",
      "pi.absence_deduction",
      "pi.gross_salary",
      "pi.net_salary",
      "pi.working_days",
      "pi.present_days",
      "pi.absent_days",
      "pi.paid_leave_days",
      "pi.unpaid_leave_days",
      "pi.status",
      "pi.currency",
      "pi.payment_date",
      "pi.payment_method",
      "pi.payment_reference",
      "pi.details",
      "pi.created_at",
    )
    .where("pi.id", id)
    .first()

  if (!payslip) {
    res.status(404)
    throw new Error("Payslip not found")
  }

  // Check if user has access to this payslip
  if (!isAdmin && payslip.user_id !== userId) {
    res.status(403)
    throw new Error("Not authorized to access this payslip")
  }

  // Parse details if available
  if (payslip.details) {
    try {
      payslip.details = JSON.parse(payslip.details)
    } catch (error) {
      console.error("Error parsing payslip details:", error)
    }
  }

  res.status(200).json({
    success: true,
    data: payslip,
  })
})

/**
 * @desc    Generate PDF payslip
 * @route   GET /api/payroll/payslips/:id/pdf
 * @access  Private
 */
exports.generatePayslipPDF = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.user.id
  const isAdmin = req.user.role === "admin"

  // Get payslip with related data
  const payslip = await db("payroll_items as pi")
    .join("payroll_periods as pp", "pi.payroll_period_id", "pp.id")
    .join("users as u", "pi.user_id", "u.id")
    .select(
      "pi.id",
      "pp.id as period_id",
      "pp.name as period_name",
      "pp.month",
      "pp.year",
      "pp.start_date",
      "pp.end_date",
      "pi.user_id",
      "u.name as user_name",
      "u.email as user_email",
      "u.department",
      "u.position",
      "pi.base_salary",
      "pi.bonuses",
      "pi.deductions",
      "pi.absence_deduction",
      "pi.gross_salary",
      "pi.net_salary",
      "pi.working_days",
      "pi.present_days",
      "pi.absent_days",
      "pi.paid_leave_days",
      "pi.unpaid_leave_days",
      "pi.status",
      "pi.currency",
      "pi.payment_date",
      "pi.payment_method",
      "pi.payment_reference",
      "pi.details",
      "pi.created_at",
    )
    .where("pi.id", id)
    .first()

  if (!payslip) {
    res.status(404)
    throw new Error("Payslip not found")
  }

  // Check if user has access to this payslip
  if (!isAdmin && payslip.user_id !== userId) {
    res.status(403)
    throw new Error("Not authorized to access this payslip")
  }

  // Create PDF document
  const doc = new PDFDocument({ margin: 50 })

  // Set response headers
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=payslip-${payslip.period_name.replace(/\s+/g, "-")}-${payslip.user_name.replace(/\s+/g, "-")}.pdf`,
  )

  // Pipe PDF to response
  doc.pipe(res)

  // Add company logo/header
  doc.fontSize(20).text("Company Name", { align: "center" })
  doc.fontSize(14).text("Payslip", { align: "center" })
  doc.moveDown()

  // Add payslip period
  doc.fontSize(12).text(`Period: ${payslip.period_name}`, { align: "center" })
  doc.moveDown(2)

  // Add employee information
  doc.fontSize(12).text("Employee Information", { underline: true })
  doc.moveDown(0.5)
  doc.text(`Name: ${payslip.user_name}`)
  doc.text(`Department: ${payslip.department || "N/A"}`)
  doc.text(`Position: ${payslip.position || "N/A"}`)
  doc.moveDown(2)

  // Add salary information
  doc.fontSize(12).text("Salary Information", { underline: true })
  doc.moveDown(0.5)
  doc.text(`Base Salary: ${formatCurrency(payslip.base_salary, payslip.currency)}`)
  doc.text(`Bonuses: ${formatCurrency(payslip.bonuses, payslip.currency)}`)
  doc.text(`Deductions: ${formatCurrency(payslip.deductions, payslip.currency)}`)
  doc.text(`Absence Deduction: ${formatCurrency(payslip.absence_deduction, payslip.currency)}`)
  doc.moveDown()
  doc.text(`Gross Salary: ${formatCurrency(payslip.gross_salary, payslip.currency)}`)
  doc.text(`Net Salary: ${formatCurrency(payslip.net_salary, payslip.currency)}`, { bold: true })
  doc.moveDown(2)

  // Add attendance information
  doc.fontSize(12).text("Attendance Information", { underline: true })
  doc.moveDown(0.5)
  doc.text(`Working Days: ${payslip.working_days}`)
  doc.text(`Present Days: ${payslip.present_days}`)
  doc.text(`Absent Days: ${payslip.absent_days}`)
  doc.text(`Paid Leave Days: ${payslip.paid_leave_days}`)
  doc.text(`Unpaid Leave Days: ${payslip.unpaid_leave_days}`)
  doc.moveDown(2)

  // Add payment information
  doc.fontSize(12).text("Payment Information", { underline: true })
  doc.moveDown(0.5)
  doc.text(`Status: ${payslip.status}`)
  doc.text(
    `Payment Date: ${payslip.payment_date ? new Date(payslip.payment_date).toLocaleDateString() : "Not paid yet"}`,
  )
  doc.text(`Payment Method: ${payslip.payment_method || "N/A"}`)
  doc.text(`Payment Reference: ${payslip.payment_reference || "N/A"}`)
  doc.moveDown(2)

  // Add footer
  doc.fontSize(10).text("This is an electronically generated payslip and does not require a signature.", {
    align: "center",
    italics: true,
  })

  // Finalize PDF
  doc.end()
})

/**
 * @desc    Update payroll item
 * @route   PUT /api/payroll/payslips/:id
 * @access  Private/Admin
 */
exports.updatePayrollItem = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { baseSalary, bonuses, deductions, absenceDeduction, status, paymentMethod, paymentReference } = req.body

  // Check if payroll item exists
  const payrollItem = await db("payroll_items").where({ id }).first()
  if (!payrollItem) {
    res.status(404)
    throw new Error("Payroll item not found")
  }

  // Prepare update data
  const updateData = {}

  if (baseSalary !== undefined) {
    updateData.base_salary = baseSalary
    // Recalculate gross and net salary
    updateData.gross_salary = baseSalary + (Number.parseFloat(payrollItem.bonuses) || 0)
    updateData.net_salary =
      updateData.gross_salary -
      (Number.parseFloat(payrollItem.deductions) || 0) -
      (Number.parseFloat(payrollItem.absence_deduction) || 0)
  }

  if (bonuses !== undefined) {
    updateData.bonuses = bonuses
    // Recalculate gross and net salary
    const base = baseSalary !== undefined ? baseSalary : Number.parseFloat(payrollItem.base_salary)
    updateData.gross_salary = base + bonuses
    updateData.net_salary =
      updateData.gross_salary -
      (Number.parseFloat(payrollItem.deductions) || 0) -
      (Number.parseFloat(payrollItem.absence_deduction) || 0)
  }

  if (deductions !== undefined) {
    updateData.deductions = deductions
    // Recalculate net salary
    const gross = updateData.gross_salary || Number.parseFloat(payrollItem.gross_salary)
    updateData.net_salary = gross - deductions - (Number.parseFloat(payrollItem.absence_deduction) || 0)
  }

  if (absenceDeduction !== undefined) {
    updateData.absence_deduction = absenceDeduction
    // Recalculate net salary
    const gross = updateData.gross_salary || Number.parseFloat(payrollItem.gross_salary)
    updateData.net_salary = gross - (Number.parseFloat(payrollItem.deductions) || 0) - absenceDeduction
  }

  if (status !== undefined) {
    updateData.status = status

    // If status is paid, set payment date
    if (status === "paid" && !payrollItem.payment_date) {
      updateData.payment_date = new Date()
    }
  }

  if (paymentMethod !== undefined) {
    updateData.payment_method = paymentMethod
  }

  if (paymentReference !== undefined) {
    updateData.payment_reference = paymentReference
  }

  // Update timestamp
  updateData.updated_at = db.fn.now()

  // Update payroll item
  const [updatedItem] = await db("payroll_items").where({ id }).update(updateData).returning("*")

  res.status(200).json({
    success: true,
    message: "Payroll item updated successfully",
    data: updatedItem,
  })
})

/**
 * @desc    Send payslips by email
 * @route   POST /api/payroll/periods/:id/send-payslips
 * @access  Private/Admin
 */
exports.sendPayslipsByEmail = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Check if payroll period exists
  const payrollPeriod = await db("payroll_periods").where({ id }).first()
  if (!payrollPeriod) {
    res.status(404)
    throw new Error("Payroll period not found")
  }

  // Get all payroll items for this period
  const payrollItems = await db("payroll_items as pi")
    .join("users as u", "pi.user_id", "u.id")
    .select("pi.id", "pi.user_id", "u.name as user_name", "u.email as user_email", "pi.status")
    .where("pi.payroll_period_id", id)
    .where("pi.status", "approved") // Only send approved payslips

  if (payrollItems.length === 0) {
    res.status(400)
    throw new Error("No approved payslips found for this period")
  }

  // Send emails in background
  const emailPromises = payrollItems.map(async (item) => {
    try {
      // Generate PDF payslip
      const pdfPath = path.join(__dirname, `../../temp/payslip-${item.id}.pdf`)
      const doc = new PDFDocument({ margin: 50 })
      const writeStream = fs.createWriteStream(pdfPath)

      doc.pipe(writeStream)

      // Add content to PDF (simplified version)
      doc.fontSize(20).text("Company Name", { align: "center" })
      doc.fontSize(14).text("Payslip", { align: "center" })
      doc.moveDown()
      doc.fontSize(12).text(`Period: ${payrollPeriod.name}`, { align: "center" })
      doc.moveDown()
      doc.text(`Employee: ${item.user_name}`)
      doc.moveDown(2)
      doc.text("Please see the attached PDF for your complete payslip details.")
      doc.end()

      // Wait for PDF to be created
      await new Promise((resolve) => {
        writeStream.on("finish", resolve)
      })

      // Send email with PDF attachment
      await emailUtils.sendPayslipEmail(item.user_email, item.user_name, payrollPeriod.name, pdfPath)

      // Delete temporary PDF file
      fs.unlinkSync(pdfPath)

      return { id: item.id, email: item.user_email, success: true }
    } catch (error) {
      console.error(`Error sending payslip email to ${item.user_email}:`, error)
      return { id: item.id, email: item.user_email, success: false, error: error.message }
    }
  })

  // Wait for all emails to be sent
  const results = await Promise.all(emailPromises)

  // Count successes and failures
  const successCount = results.filter((r) => r.success).length
  const failureCount = results.length - successCount

  res.status(200).json({
    success: true,
    message: `Payslips sent: ${successCount} successful, ${failureCount} failed`,
    data: {
      total: results.length,
      successful: successCount,
      failed: failureCount,
      results,
    },
  })
})

// Helper Functions

/**
 * Calculate working days in a month
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @returns {number} - Number of working days
 */
function getWorkingDaysInMonth(year, month) {
  const startDate = new Date(year, month, 1)
  const endDate = new Date(year, month + 1, 0)

  let workingDays = 0
  const currentDate = new Date(startDate)

  while (currentDate <= endDate) {
    // 0 is Sunday, 6 is Saturday
    const dayOfWeek = currentDate.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return workingDays
}

/**
 * Calculate present days from attendance records
 * @param {Array} attendance - Attendance records
 * @returns {number} - Number of present days
 */
function calculatePresentDays(attendance) {
  // Group attendance by day
  const attendanceByDay = {}

  attendance.forEach((record) => {
    const date = new Date(record.timestamp).toISOString().split("T")[0]
    if (!attendanceByDay[date]) {
      attendanceByDay[date] = []
    }
    attendanceByDay[date].push(record)
  })

  // Count days with at least one check-in
  return Object.keys(attendanceByDay).length
}

/**
 * Calculate leave days
 * @param {Array} leaves - Leave requests
 * @param {Date} startDate - Period start date
 * @param {Date} endDate - Period end date
 * @returns {Object} - Paid and unpaid leave days
 */
function calculateLeaveDays(leaves, startDate, endDate) {
  let paidLeaves = 0
  let unpaidLeaves = 0

  leaves.forEach((leave) => {
    // Calculate overlap between leave period and payroll period
    const leaveStart = new Date(Math.max(new Date(leave.start_date), startDate))
    const leaveEnd = new Date(Math.min(new Date(leave.end_date), endDate))

    // Calculate business days in the leave period
    let leaveDays = 0
    const currentDate = new Date(leaveStart)

    while (currentDate <= leaveEnd) {
      // 0 is Sunday, 6 is Saturday
      const dayOfWeek = currentDate.getDay()
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        leaveDays++
      }
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Add to paid or unpaid leaves based on leave type
    if (leave.type === "sick" || leave.type === "vacation") {
      paidLeaves += leaveDays
    } else {
      unpaidLeaves += leaveDays
    }
  })

  return { paid: paidLeaves, unpaid: unpaidLeaves }
}

/**
 * Format currency
 * @param {number} amount - Amount
 * @param {string} currency - Currency code
 * @returns {string} - Formatted currency
 */
function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(amount)
}
