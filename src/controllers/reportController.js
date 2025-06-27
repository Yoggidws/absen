const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const PDFDocument = require("pdfkit")
const ExcelJS = require("exceljs")
const fs = require("fs")
const path = require("path")
const { format } = require("date-fns")

/**
 * Safely convert a value to a number, returning 0 for invalid values
 * @param {any} value - Value to convert
 * @returns {number} - Valid number or 0
 */
function safeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  
  const num = Number.parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Safely convert a value to an integer, returning 0 for invalid values
 * @param {any} value - Value to convert
 * @returns {number} - Valid integer or 0
 */
function safeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  
  const num = Number.parseInt(value, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * @desc    Generate attendance report
 * @route   POST /api/reports/attendance
 * @access  Private/Admin
 */
exports.generateAttendanceReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, department, format = "pdf" } = req.body

  if (!startDate || !endDate) {
    res.status(400)
    throw new Error("Start date and end date are required")
  }

  // Validate dates
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (start > end) {
    res.status(400)
    throw new Error("Start date cannot be after end date")
  }

  // Get users
  let userQuery = db("users")
    .where({ active: true })
    .select("id", "name", "email", "department", "position")
    .orderBy("name", "asc")

  // Filter by department if provided
  if (department) {
    userQuery = userQuery.where({ department })
  }

  const users = await userQuery

  // Get attendance data for all users in the date range
  const attendanceData = await db("attendance").whereBetween("timestamp", [start, end]).orderBy("timestamp", "asc")

  // Calculate working days in the period
  const workingDays = getWorkingDaysInPeriod(start, end)

  // Group attendance by user
  const attendanceByUser = {}
  attendanceData.forEach((record) => {
    if (!attendanceByUser[record.user_id]) {
      attendanceByUser[record.user_id] = []
    }
    attendanceByUser[record.user_id].push(record)
  })

  // Calculate statistics for each user
  const userStats = users.map((user) => {
    const userAttendance = attendanceByUser[user.id] || []

    // Group by day
    const attendanceByDay = {}
    userAttendance.forEach((record) => {
      const day = new Date(record.timestamp).toISOString().split("T")[0]
      if (!attendanceByDay[day]) {
        attendanceByDay[day] = []
      }
      attendanceByDay[day].push(record)
    })

    // Calculate present days
    const presentDays = Object.keys(attendanceByDay).length

    // Calculate late days
    let lateDays = 0
    Object.keys(attendanceByDay).forEach((day) => {
      const dayRecords = attendanceByDay[day]
      const checkIns = dayRecords.filter((r) => r.type === "check-in")

      if (checkIns.length > 0) {
        const firstCheckIn = new Date(checkIns[0].timestamp)
        if (firstCheckIn.getHours() > 9 || (firstCheckIn.getHours() === 9 && firstCheckIn.getMinutes() > 15)) {
          lateDays++
        }
      }
    })

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      department: user.department || "Unassigned",
      position: user.position || "Unassigned",
      presentDays,
      absentDays: workingDays - presentDays,
      lateDays,
      attendanceRate: Math.round((presentDays / workingDays) * 100),
    }
  })

  // Generate a unique ID for the report
  const reportId = "RPT-" + Math.random().toString(36).substring(2, 10).toUpperCase()

  // Create report record
  const [report] = await db("reports")
    .insert({
      id: reportId,
      name: `Attendance Report ${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`,
      type: "custom",
      format: format.toLowerCase(),
      date_range: JSON.stringify({ startDate, endDate }),
      filters: JSON.stringify({ department }),
      created_by: req.user.id,
    })
    .returning("*")

  // Generate report file
  let filePath
  if (format.toLowerCase() === "pdf") {
    filePath = await generateAttendancePDF(userStats, start, end, workingDays, department)
  } else if (format.toLowerCase() === "excel") {
    filePath = await generateAttendanceExcel(userStats, start, end, workingDays, department)
  } else {
    res.status(400)
    throw new Error("Invalid format. Supported formats: pdf, excel")
  }

  // Update report with file URL
  await db("reports").where({ id: report.id }).update({
    file_url: filePath,
  })

  // Verify file exists and has content before streaming
  console.log('🔍 DEBUG: PRE-STREAM CHECK: Attempting to stream file from filePath:', filePath);
  if (!fs.existsSync(filePath)) {
    res.status(500)
    throw new Error("Generated file not found")
  }

  const stats = fs.statSync(filePath)
  if (stats.size === 0) {
    res.status(500)
    throw new Error("Generated file is empty")
  }

  console.log('🔍 DEBUG: File verified, size:', stats.size, 'bytes')

  // Set response headers for file download
  const filename = `attendance-report-${Date.now()}.${format === "excel" ? "xlsx" : format}`
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.setHeader("Content-Length", stats.size)

  console.log('🔍 DEBUG: Setting content type for format:', format)
  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf")
  } else if (format === "excel") {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  }

  // Stream file to response with proper error handling
  const fileStream = fs.createReadStream(filePath)
  
  fileStream.on('error', (error) => {
    console.error('🔍 DEBUG: File stream error:', error.message)
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error reading file' })
    }
  })

  fileStream.on('end', () => {
    console.log('🔍 DEBUG: File stream completed successfully')
  })

  fileStream.pipe(res)
})

/**
 * @desc    Generate leave report
 * @route   POST /api/reports/leave
 * @access  Private/Admin
 */
exports.generateLeaveReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, department, status, format = "pdf" } = req.body

  if (!startDate || !endDate) {
    res.status(400)
    throw new Error("Start date and end date are required")
  }

  // Validate dates
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (start > end) {
    res.status(400)
    throw new Error("Start date cannot be after end date")
  }

  // Get leave requests
  let leaveQuery = db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .leftJoin("users as a", "lr.approved_by", "a.id")
    .select(
      "lr.id",
      "lr.type",
      "lr.start_date",
      "lr.end_date",
      "lr.reason",
      "lr.status",
      "lr.approval_notes",
      "lr.created_at",
      "u.id as user_id",
      "u.name as user_name",
      "u.email as user_email",
      "u.department",
      "a.name as approved_by_name",
    )
    .where(function () {
      this.whereBetween("lr.start_date", [start, end]).orWhereBetween("lr.end_date", [start, end])
    })
    .orderBy("lr.created_at", "desc")

  // Apply filters
  if (department) {
    leaveQuery = leaveQuery.where("u.department", department)
  }

  if (status) {
    leaveQuery = leaveQuery.where("lr.status", status)
  }

  const leaveRequests = await leaveQuery

  // Calculate statistics
  const leaveStats = {
    total: leaveRequests.length,
    byStatus: {
      pending: leaveRequests.filter((r) => r.status === "pending").length,
      approved: leaveRequests.filter((r) => r.status === "approved").length,
      rejected: leaveRequests.filter((r) => r.status === "rejected").length,
    },
    byType: {
      sick: leaveRequests.filter((r) => r.type === "sick").length,
      vacation: leaveRequests.filter((r) => r.type === "vacation").length,
      personal: leaveRequests.filter((r) => r.type === "personal").length,
      other: leaveRequests.filter((r) => r.type === "other").length,
    },
    byDepartment: {},
  }

  // Group by department
  leaveRequests.forEach((request) => {
    const dept = request.department || "Unassigned"
    if (!leaveStats.byDepartment[dept]) {
      leaveStats.byDepartment[dept] = 0
    }
    leaveStats.byDepartment[dept]++
  })

  // Create report record
  const [report] = await db("reports")
    .insert({
      name: `Leave Report ${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`,
      type: "custom",
      format: format.toLowerCase(),
      date_range: JSON.stringify({ startDate, endDate }),
      filters: JSON.stringify({ department, status }),
      created_by: req.user.id,
    })
    .returning("*")

  // Generate report file
  let filePath
  if (format.toLowerCase() === "pdf") {
    filePath = await generateLeavePDF(leaveRequests, leaveStats, start, end, department, status)
  } else if (format.toLowerCase() === "excel") {
    filePath = await generateLeaveExcel(leaveRequests, leaveStats, start, end, department, status)
  } else {
    res.status(400)
    throw new Error("Invalid format. Supported formats: pdf, excel")
  }

  // Update report with file URL
  await db("reports").where({ id: report.id }).update({
    file_url: filePath,
  })

  // Verify file exists and has content before streaming
  console.log('🔍 DEBUG: PRE-STREAM CHECK: Attempting to stream file from filePath:', filePath);
  if (!fs.existsSync(filePath)) {
    res.status(500)
    throw new Error("Generated file not found")
  }

  const stats = fs.statSync(filePath)
  if (stats.size === 0) {
    res.status(500)
    throw new Error("Generated file is empty")
  }

  console.log('🔍 DEBUG: File verified, size:', stats.size, 'bytes')

  // Set response headers for file download
  const filename = `leave-report-${Date.now()}.${format === "excel" ? "xlsx" : format}`
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.setHeader("Content-Length", stats.size)

  console.log('🔍 DEBUG: Setting content type for format:', format)
  if (format === "pdf") {
    res.setHeader("Content-Type", "application/pdf")
  } else if (format === "excel") {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  }

  // Stream file to response with proper error handling
  const fileStream = fs.createReadStream(filePath)
  
  fileStream.on('error', (error) => {
    console.error('🔍 DEBUG: File stream error:', error.message)
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error reading file' })
    }
  })

  fileStream.on('end', () => {
    console.log('🔍 DEBUG: File stream completed successfully')
  })

  fileStream.pipe(res)
})

/**
 * @desc    Generate payroll report
 * @route   POST /api/reports/payroll
 * @access  Private/Admin
 */
exports.generatePayrollReport = asyncHandler(async (req, res) => {
  const { periodId, department } = req.body
  // Accept format from body or query string
  let format = req.body.format || req.query.format || "pdf"
  if (typeof format !== 'string') {
    format = "pdf"
  }
  format = format.toLowerCase()

  if (!periodId) {
    res.status(400)
    throw new Error("Payroll period ID is required")
  }

  await generatePayrollReportFile(req, res, periodId, department, format)
})

/**
 * @desc    Export payroll report by period ID
 * @route   GET /api/reports/payroll/:periodId
 * @access  Private/Admin
 */
exports.exportPayrollReport = asyncHandler(async (req, res) => {
  const { periodId } = req.params
  const { department } = req.query
  
  // Add debugging for format parameter
  console.log('🔍 DEBUG: exportPayrollReport - Raw query:', req.query);
  console.log('🔍 DEBUG: exportPayrollReport - req.query.format:', req.query.format);
  
  // Get format from query parameters with explicit validation
  let format = 'pdf'; // Default to PDF
  
  if (req.query.format) {
    const requestedFormat = String(req.query.format).toLowerCase().trim();
    console.log('🔍 DEBUG: exportPayrollReport - Requested format (cleaned):', requestedFormat);
    
    // Only allow 'pdf' or 'excel' formats
    if (requestedFormat === 'excel' || requestedFormat === 'pdf') {
      format = requestedFormat;
    } else {
      console.log('🔍 DEBUG: exportPayrollReport - Invalid format requested, defaulting to pdf');
    }
  }
  
  console.log('🔍 DEBUG: exportPayrollReport - Final format before passing to generatePayrollReportFile:', format);

  if (!periodId) {
    res.status(400)
    throw new Error("Payroll period ID is required")
  }

  await generatePayrollReportFile(req, res, periodId, department, format)
})

/**
 * @desc    Generate payroll report file (shared logic)
 * @access  Private
 */
const generatePayrollReportFile = asyncHandler(async (req, res, periodId, department, format) => {
  // Add debugging for incoming parameters
  console.log('🔍 DEBUG: generatePayrollReportFile - Incoming parameters:');
  console.log('🔍 DEBUG: - periodId:', periodId);
  console.log('🔍 DEBUG: - department:', department);
  console.log('🔍 DEBUG: - format (raw):', format);
  console.log('🔍 DEBUG: - format type:', typeof format);
  
  // Ensure format is valid - only default to pdf if format is truly invalid
  if (!format || typeof format !== 'string' || format.trim() === '') {
    console.log('🔍 DEBUG: Format was invalid, defaulting to pdf. Original format:', format);
    format = 'pdf'
  } else {
    format = format.toLowerCase().trim()
  }
  
  // Add debugging
  console.log('🔍 DEBUG: generatePayrollReportFile called with format:', format)
  
  // Validate format
  if (format !== 'pdf' && format !== 'excel') {
    res.status(400)
    throw new Error("Invalid format. Supported formats: pdf, excel")
  }

  // Get payroll period
  const payrollPeriod = await db("payroll_periods").where({ id: periodId }).first()
  if (!payrollPeriod) {
    res.status(404)
    throw new Error("Payroll period not found")
  }

  console.log('🔍 DEBUG: Payroll period found:', payrollPeriod.name)

  // Get payroll items
  let payrollQuery = db("payroll_items as pi")
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
    .where("pi.payroll_period_id", periodId)
    .orderBy("u.name", "asc")

  // Filter by department if provided
  if (department) {
    payrollQuery = payrollQuery.where("u.department", department)
  }

  const payrollItems = await payrollQuery

  console.log('🔍 DEBUG: Payroll items found:', payrollItems.length)

  // Calculate totals
  const totals = payrollItems.reduce(
    (acc, item) => {
      acc.totalGrossSalary += safeNumber(item.gross_salary)
      acc.totalNetSalary += safeNumber(item.net_salary)
      acc.totalBonuses += safeNumber(item.bonuses)
      acc.totalDeductions += safeNumber(item.deductions)
      acc.totalAbsenceDeduction += safeNumber(item.absence_deduction)
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

  // Generate a unique ID for the report
  const reportId = "RPT-" + Math.random().toString(36).substring(2, 10).toUpperCase()

  // Create report record
  const [report] = await db("reports")
    .insert({
      id: reportId,
      name: `Payroll Report - ${payrollPeriod.name}`,
      type: "custom",
      format: format,
      date_range: JSON.stringify({
        startDate: payrollPeriod.start_date,
        endDate: payrollPeriod.end_date,
      }),
      filters: JSON.stringify({ department, periodId }),
      created_by: req.user.id,
    })
    .returning("*")

  console.log('🔍 DEBUG: Report record created with format:', report.format)

  // Generate report file
  let filePath
  console.log('🔍 DEBUG: About to generate file, format check:', format)
  
  try {
    if (format === "pdf") {
      console.log('🔍 DEBUG: Generating PDF file')
      filePath = await generatePayrollPDF(payrollItems, totals, payrollPeriod, department)
    } else if (format === "excel") {
      console.log('🔍 DEBUG: Generating Excel file')
      filePath = await generatePayrollExcel(payrollItems, totals, payrollPeriod, department)
    } else {
      throw new Error(`Unsupported format: ${format}`)
    }
    
    if (!filePath) {
      throw new Error(`Failed to generate ${format} file - no file path returned`)
    }
    
    console.log('🔍 DEBUG: File generated successfully at:', filePath)
    
  } catch (error) {
    console.error('🔍 DEBUG: Error generating file:', error.message)
    console.error('🔍 DEBUG: Error stack:', error.stack)
    res.status(500)
    throw new Error(`Failed to generate ${format} report: ${error.message}`)
  }

  // Update report with file URL
  await db("reports").where({ id: report.id }).update({
    file_url: filePath,
  })

  // Verify file exists and has content before streaming
  console.log('🔍 DEBUG: PRE-STREAM CHECK: Attempting to stream file from filePath:', filePath);
  if (!fs.existsSync(filePath)) {
    res.status(500)
    throw new Error("Generated file not found")
  }

  const stats = fs.statSync(filePath)
  if (stats.size === 0) {
    res.status(500)
    throw new Error("Generated file is empty")
  }

  console.log('🔍 DEBUG: File verified, size:', stats.size, 'bytes')

  // Set response headers for file download
  const filename = `payroll-report-${payrollPeriod.name.replace(/\s+/g, "-")}.${format === "excel" ? "xlsx" : format}`
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.setHeader("Content-Length", stats.size)

  console.log('🔍 DEBUG: PRE-CHECK: format is:', format);
  if (format === "pdf") {
    console.log('🔍 DEBUG: Setting Content-Type to application/pdf');
    res.setHeader("Content-Type", "application/pdf");
    console.log('🔍 DEBUG: POST-CHECK: Content-Type for PDF set.');
  } else if (format === "excel") {
    console.log('🔍 DEBUG: Setting Content-Type to application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    console.log('🔍 DEBUG: POST-CHECK: Content-Type for Excel set.');
  } else {
    console.log('🔍 DEBUG: WARNING - format is neither pdf nor excel. Format:', format);
  }

  // Stream file to response with proper error handling
  const fileStream = fs.createReadStream(filePath)
  
  fileStream.on('error', (error) => {
    console.error('🔍 DEBUG: File stream error:', error.message)
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error reading file' })
    }
  })

  fileStream.on('end', () => {
    console.log('🔍 DEBUG: File stream completed successfully')
  })

  fileStream.pipe(res)
})

/**
 * @desc    Get all reports
 * @route   GET /api/reports
 * @access  Private/Admin
 */
exports.getAllReports = asyncHandler(async (req, res) => {
  const { type, format } = req.query

  // Build query
  let query = db("reports as r")
    .join("users as u", "r.created_by", "u.id")
    .select(
      "r.id",
      "r.name",
      "r.type",
      "r.format",
      "r.date_range",
      "r.filters",
      "r.file_url",
      "r.created_at",
      "u.name as created_by_name",
    )
    .orderBy("r.created_at", "desc")

  // Apply filters
  if (type) {
    query = query.where("r.type", type)
  }

  if (format) {
    query = query.where("r.format", format)
  }

  const reports = await query

  res.status(200).json({
    success: true,
    count: reports.length,
    data: reports,
  })
})

/**
 * @desc    Get report by ID
 * @route   GET /api/reports/:id
 * @access  Private/Admin
 */
exports.getReportById = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Get report
  const report = await db("reports as r")
    .join("users as u", "r.created_by", "u.id")
    .select(
      "r.id",
      "r.name",
      "r.type",
      "r.format",
      "r.date_range",
      "r.filters",
      "r.file_url",
      "r.created_at",
      "u.name as created_by_name",
      "u.email as created_by_email",
    )
    .where("r.id", id)
    .first()

  if (!report) {
    res.status(404)
    throw new Error("Report not found")
  }

  // Parse JSON fields
  if (report.date_range) {
    try {
      report.date_range = JSON.parse(report.date_range)
    } catch (error) {
      console.error("Error parsing date_range:", error)
    }
  }

  if (report.filters) {
    try {
      report.filters = JSON.parse(report.filters)
    } catch (error) {
      console.error("Error parsing filters:", error)
    }
  }

  res.status(200).json({
    success: true,
    data: report,
  })
})

/**
 * @desc    Download report file
 * @route   GET /api/reports/:id/download
 * @access  Private/Admin
 */
exports.downloadReport = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Get report
  const report = await db("reports").where({ id }).first()

  if (!report) {
    res.status(404)
    throw new Error("Report not found")
  }

  if (!report.file_url) {
    res.status(404)
    throw new Error("Report file not found")
  }

  // Check if file exists
  if (!fs.existsSync(report.file_url)) {
    res.status(404)
    throw new Error("Report file not found")
  }

  // Verify file has content
  const stats = fs.statSync(report.file_url)
  if (stats.size === 0) {
    res.status(404)
    throw new Error("Report file is empty")
  }

  // Set response headers
  const filename = path.basename(report.file_url)
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
  res.setHeader("Content-Length", stats.size)

  if (report.format === "pdf") {
    res.setHeader("Content-Type", "application/pdf")
  } else if (report.format === "excel") {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  } else {
    res.setHeader("Content-Type", "application/octet-stream")
  }

  // Stream file to response with proper error handling
  const fileStream = fs.createReadStream(report.file_url)
  
  fileStream.on('error', (error) => {
    console.error('Download file stream error:', error.message)
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error reading file' })
    }
  })

  fileStream.on('end', () => {
    console.log('Download file stream completed successfully')
  })

  fileStream.pipe(res)
})

/**
 * @desc    Delete report
 * @route   DELETE /api/reports/:id
 * @access  Private/Admin
 */
exports.deleteReport = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Get report
  const report = await db("reports").where({ id }).first()

  if (!report) {
    res.status(404)
    throw new Error("Report not found")
  }

  // Delete file if exists
  if (report.file_url && fs.existsSync(report.file_url)) {
    fs.unlinkSync(report.file_url)
  }

  // Delete report
  await db("reports").where({ id }).delete()

  res.status(200).json({
    success: true,
    message: "Report deleted successfully",
  })
})

// Helper Functions

/**
 * Calculate working days in a period
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {number} - Number of working days
 */
function getWorkingDaysInPeriod(startDate, endDate) {
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
 * Generate attendance report PDF
 * @param {Array} userStats - User attendance statistics
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {number} workingDays - Number of working days
 * @param {string} department - Department filter
 * @returns {string} - File path
 */
async function generateAttendancePDF(userStats, startDate, endDate, workingDays, department) {
  // Create directory if it doesn't exist
  const uploadsDir = path.join(__dirname, "../../uploads/reports")
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  // Create PDF document
  const filePath = path.join(uploadsDir, `attendance-report-${Date.now()}.pdf`)
  const doc = new PDFDocument({ margin: 50 })

  // Pipe to file
  const writeStream = fs.createWriteStream(filePath)
  doc.pipe(writeStream)

  // Add title
  doc.fontSize(20).text("Attendance Report", { align: "center" })
  doc.moveDown()

  // Add report period
  doc
    .fontSize(12)
    .text(`Period: ${format(startDate, "MMMM d, yyyy")} to ${format(endDate, "MMMM d, yyyy")}`, { align: "center" })
  doc.fontSize(12).text(`Working Days: ${workingDays}`, { align: "center" })
  if (department) {
    doc.fontSize(12).text(`Department: ${department}`, { align: "center" })
  }
  doc.moveDown(2)

  // Add summary
  doc.fontSize(16).text("Summary", { underline: true })
  doc.moveDown()

  const totalEmployees = userStats.length
  const totalPresent = userStats.reduce((sum, stat) => sum + stat.presentDays, 0)
  const totalAbsent = userStats.reduce((sum, stat) => sum + stat.absentDays, 0)
  const totalLate = userStats.reduce((sum, stat) => sum + stat.lateDays, 0)
  const avgAttendance = totalEmployees > 0 ? Math.round((totalPresent / (totalEmployees * workingDays)) * 100) : 0

  doc.fontSize(12).text(`Total Employees: ${totalEmployees}`)
  doc.fontSize(12).text(`Average Attendance Rate: ${avgAttendance}%`)
  doc.fontSize(12).text(`Total Present Days: ${totalPresent}`)
  doc.fontSize(12).text(`Total Absent Days: ${totalAbsent}`)
  doc.fontSize(12).text(`Total Late Days: ${totalLate}`)
  doc.moveDown(2)

  // Add employee details
  doc.fontSize(16).text("Employee Details", { underline: true })
  doc.moveDown()

  // Table header
  const tableTop = doc.y
  const tableLeft = 50
  const colWidths = [150, 80, 80, 80, 80]

  doc.fontSize(10).text("Employee", tableLeft, tableTop)
  doc.text("Present Days", tableLeft + colWidths[0], tableTop)
  doc.text("Absent Days", tableLeft + colWidths[0] + colWidths[1], tableTop)
  doc.text("Late Days", tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop)
  doc.text("Attendance %", tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], tableTop)

  doc
    .moveTo(tableLeft, tableTop + 15)
    .lineTo(tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], tableTop + 15)
    .stroke()

  // Table rows
  let rowTop = tableTop + 20

  userStats.forEach((stat, index) => {
    // Check if we need a new page
    if (rowTop > doc.page.height - 100) {
      doc.addPage()
      rowTop = 50

      // Add header to new page
      doc.fontSize(10).text("Employee", tableLeft, rowTop)
      doc.text("Present Days", tableLeft + colWidths[0], rowTop)
      doc.text("Absent Days", tableLeft + colWidths[0] + colWidths[1], rowTop)
      doc.text("Late Days", tableLeft + colWidths[0] + colWidths[1] + colWidths[2], rowTop)
      doc.text("Attendance %", tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], rowTop)

      doc
        .moveTo(tableLeft, rowTop + 15)
        .lineTo(tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], rowTop + 15)
        .stroke()

      rowTop += 20
    }

    doc.fontSize(10).text(`${stat.name} (${stat.department})`, tableLeft, rowTop)
    doc.text(stat.presentDays.toString(), tableLeft + colWidths[0], rowTop)
    doc.text(stat.absentDays.toString(), tableLeft + colWidths[0] + colWidths[1], rowTop)
    doc.text(stat.lateDays.toString(), tableLeft + colWidths[0] + colWidths[1] + colWidths[2], rowTop)
    doc.text(`${stat.attendanceRate}%`, tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], rowTop)

    rowTop += 20
  })

  // Add footer
  doc.fontSize(10).text(`Report generated on ${format(new Date(), "MMMM d, yyyy HH:mm")}`, { align: "center" })

  // Finalize PDF
  doc.end()

  // Wait for file to be written
  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => resolve(filePath))
    writeStream.on("error", reject)
  })
}

/**
 * Generate attendance report Excel
 * @param {Array} userStats - User attendance statistics
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {number} workingDays - Number of working days
 * @param {string} department - Department filter
 * @returns {string} - File path
 */
async function generateAttendanceExcel(userStats, startDate, endDate, workingDays, department) {
  // Create directory if it doesn't exist
  const uploadsDir = path.join(__dirname, "../../uploads/reports")
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  // Create Excel workbook
  const filePath = path.join(uploadsDir, `attendance-report-${Date.now()}.xlsx`)
  const workbook = new ExcelJS.Workbook()

  // Add metadata
  workbook.creator = "HR System"
  workbook.created = new Date()
  workbook.modified = new Date()

  // Create summary worksheet
  const summarySheet = workbook.addWorksheet("Summary")

  // Add title
  summarySheet.mergeCells("A1:E1")
  summarySheet.getCell("A1").value = "Attendance Report"
  summarySheet.getCell("A1").font = { size: 16, bold: true }
  summarySheet.getCell("A1").alignment = { horizontal: "center" }

  // Add report period
  summarySheet.mergeCells("A2:E2")
  summarySheet.getCell("A2").value =
    `Period: ${format(startDate, "MMMM d, yyyy")} to ${format(endDate, "MMMM d, yyyy")}`
  summarySheet.getCell("A2").alignment = { horizontal: "center" }

  summarySheet.mergeCells("A3:E3")
  summarySheet.getCell("A3").value = `Working Days: ${workingDays}`
  summarySheet.getCell("A3").alignment = { horizontal: "center" }

  if (department) {
    summarySheet.mergeCells("A4:E4")
    summarySheet.getCell("A4").value = `Department: ${department}`
    summarySheet.getCell("A4").alignment = { horizontal: "center" }
  }

  // Add summary
  summarySheet.getCell("A6").value = "Summary"
  summarySheet.getCell("A6").font = { size: 14, bold: true }

  const totalEmployees = userStats.length
  const totalPresent = userStats.reduce((sum, stat) => sum + stat.presentDays, 0)
  const totalAbsent = userStats.reduce((sum, stat) => sum + stat.absentDays, 0)
  const totalLate = userStats.reduce((sum, stat) => sum + stat.lateDays, 0)
  const avgAttendance = totalEmployees > 0 ? Math.round((totalPresent / (totalEmployees * workingDays)) * 100) : 0

  summarySheet.getCell("A8").value = "Total Employees:"
  summarySheet.getCell("B8").value = totalEmployees

  summarySheet.getCell("A9").value = "Average Attendance Rate:"
  summarySheet.getCell("B9").value = `${avgAttendance}%`

  summarySheet.getCell("A10").value = "Total Present Days:"
  summarySheet.getCell("B10").value = totalPresent

  summarySheet.getCell("A11").value = "Total Absent Days:"
  summarySheet.getCell("B11").value = totalAbsent

  summarySheet.getCell("A12").value = "Total Late Days:"
  summarySheet.getCell("B12").value = totalLate

  // Create details worksheet
  const detailsSheet = workbook.addWorksheet("Employee Details")

  // Add headers
  detailsSheet.columns = [
    { header: "Employee Name", key: "name", width: 30 },
    { header: "Department", key: "department", width: 20 },
    { header: "Position", key: "position", width: 20 },
    { header: "Present Days", key: "presentDays", width: 15 },
    { header: "Absent Days", key: "absentDays", width: 15 },
    { header: "Late Days", key: "lateDays", width: 15 },
    { header: "Attendance Rate", key: "attendanceRate", width: 15 },
  ]

  // Style header row
  detailsSheet.getRow(1).font = { bold: true }

  // Add data
  userStats.forEach((stat) => {
    detailsSheet.addRow({
      name: stat.name,
      department: stat.department,
      position: stat.position,
      presentDays: stat.presentDays,
      absentDays: stat.absentDays,
      lateDays: stat.lateDays,
      attendanceRate: `${stat.attendanceRate}%`,
    })
  })

  // Save workbook
  await workbook.xlsx.writeFile(filePath)

  return filePath
}

/**
 * Generate leave report PDF
 * @param {Array} leaveRequests - Leave requests
 * @param {Object} leaveStats - Leave statistics
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} department - Department filter
 * @param {string} status - Status filter
 * @returns {string} - File path
 */
async function generateLeavePDF(leaveRequests, leaveStats, startDate, endDate, department, status) {
  // Create directory if it doesn't exist
  const uploadsDir = path.join(__dirname, "../../uploads/reports")
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  // Create PDF document
  const filePath = path.join(uploadsDir, `leave-report-${Date.now()}.pdf`)
  const doc = new PDFDocument({ margin: 50 })

  // Pipe to file
  const writeStream = fs.createWriteStream(filePath)
  doc.pipe(writeStream)

  // Add title
  doc.fontSize(20).text("Leave Report", { align: "center" })
  doc.moveDown()

  // Add report period
  doc
    .fontSize(12)
    .text(`Period: ${format(startDate, "MMMM d, yyyy")} to ${format(endDate, "MMMM d, yyyy")}`, { align: "center" })
  if (department) {
    doc.fontSize(12).text(`Department: ${department}`, { align: "center" })
  }
  if (status) {
    doc.fontSize(12).text(`Status: ${status}`, { align: "center" })
  }
  doc.moveDown(2)

  // Add summary
  doc.fontSize(16).text("Summary", { underline: true })
  doc.moveDown()

  doc.fontSize(12).text(`Total Leave Requests: ${leaveStats.total}`)
  doc.moveDown()

  doc.fontSize(12).text("By Status:")
  doc.fontSize(10).text(`Pending: ${leaveStats.byStatus.pending}`, { indent: 20 })
  doc.fontSize(10).text(`Approved: ${leaveStats.byStatus.approved}`, { indent: 20 })
  doc.fontSize(10).text(`Rejected: ${leaveStats.byStatus.rejected}`, { indent: 20 })
  doc.moveDown()

  doc.fontSize(12).text("By Type:")
  doc.fontSize(10).text(`Sick: ${leaveStats.byType.sick}`, { indent: 20 })
  doc.fontSize(10).text(`Vacation: ${leaveStats.byType.vacation}`, { indent: 20 })
  doc.fontSize(10).text(`Personal: ${leaveStats.byType.personal}`, { indent: 20 })
  doc.fontSize(10).text(`Other: ${leaveStats.byType.other}`, { indent: 20 })
  doc.moveDown()

  doc.fontSize(12).text("By Department:")
  Object.entries(leaveStats.byDepartment).forEach(([dept, count]) => {
    doc.fontSize(10).text(`${dept}: ${count}`, { indent: 20 })
  })
  doc.moveDown(2)

  // Add leave request details
  doc.fontSize(16).text("Leave Request Details", { underline: true })
  doc.moveDown()

  // Table header
  const tableTop = doc.y
  const tableLeft = 50

  doc.fontSize(10).text("Employee", tableLeft, tableTop)
  doc.text("Type", tableLeft + 150, tableTop)
  doc.text("Period", tableLeft + 200, tableTop)
  doc.text("Status", tableLeft + 350, tableTop)

  doc
    .moveTo(tableLeft, tableTop + 15)
    .lineTo(tableLeft + 450, tableTop + 15)
    .stroke()

  // Table rows
  let rowTop = tableTop + 20

  leaveRequests.forEach((request, index) => {
    // Check if we need a new page
    if (rowTop > doc.page.height - 100) {
      doc.addPage()
      rowTop = 50

      // Add header to new page
      doc.fontSize(10).text("Employee", tableLeft, rowTop)
      doc.text("Type", tableLeft + 150, rowTop)
      doc.text("Period", tableLeft + 200, rowTop)
      doc.text("Status", tableLeft + 350, rowTop)

      doc
        .moveTo(tableLeft, rowTop + 15)
        .lineTo(tableLeft + 450, rowTop + 15)
        .stroke()

      rowTop += 20
    }

    const startDateStr = format(new Date(request.start_date), "MMM d, yyyy")
    const endDateStr = format(new Date(request.end_date), "MMM d, yyyy")

    doc.fontSize(10).text(request.user_name, tableLeft, rowTop)
    doc.text(request.type, tableLeft + 150, rowTop)
    doc.text(`${startDateStr} - ${endDateStr}`, tableLeft + 200, rowTop)
    doc.text(request.status, tableLeft + 350, rowTop)

    rowTop += 20
  })

  // Add footer
  doc.fontSize(10).text(`Report generated on ${format(new Date(), "MMMM d, yyyy HH:mm")}`, { align: "center" })

  // Finalize PDF
  doc.end()

  // Wait for file to be written
  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => resolve(filePath))
    writeStream.on("error", reject)
  })
}

/**
 * Generate leave report Excel
 * @param {Array} leaveRequests - Leave requests
 * @param {Object} leaveStats - Leave statistics
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} department - Department filter
 * @param {string} status - Status filter
 * @returns {string} - File path
 */
async function generateLeaveExcel(leaveRequests, leaveStats, startDate, endDate, department, status) {
  // Create directory if it doesn't exist
  const uploadsDir = path.join(__dirname, "../../uploads/reports")
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  // Create Excel workbook
  const filePath = path.join(uploadsDir, `leave-report-${Date.now()}.xlsx`)
  const workbook = new ExcelJS.Workbook()

  // Add metadata
  workbook.creator = "HR System"
  workbook.created = new Date()
  workbook.modified = new Date()

  // Create summary worksheet
  const summarySheet = workbook.addWorksheet("Summary")

  // Add title
  summarySheet.mergeCells("A1:E1")
  summarySheet.getCell("A1").value = "Leave Report"
  summarySheet.getCell("A1").font = { size: 16, bold: true }
  summarySheet.getCell("A1").alignment = { horizontal: "center" }

  // Add report period
  summarySheet.mergeCells("A2:E2")
  summarySheet.getCell("A2").value =
    `Period: ${format(startDate, "MMMM d, yyyy")} to ${format(endDate, "MMMM d, yyyy")}`
  summarySheet.getCell("A2").alignment = { horizontal: "center" }

  if (department) {
    summarySheet.mergeCells("A3:E3")
    summarySheet.getCell("A3").value = `Department: ${department}`
    summarySheet.getCell("A3").alignment = { horizontal: "center" }
  }

  if (status) {
    summarySheet.mergeCells("A4:E4")
    summarySheet.getCell("A4").value = `Status: ${status}`
    summarySheet.getCell("A4").alignment = { horizontal: "center" }
  }

  // Add summary
  summarySheet.getCell("A6").value = "Summary"
  summarySheet.getCell("A6").font = { size: 14, bold: true }

  summarySheet.getCell("A8").value = "Total Leave Requests:"
  summarySheet.getCell("B8").value = leaveStats.total

  summarySheet.getCell("A10").value = "By Status"
  summarySheet.getCell("A10").font = { bold: true }

  summarySheet.getCell("A11").value = "Pending:"
  summarySheet.getCell("B11").value = leaveStats.byStatus.pending

  summarySheet.getCell("A12").value = "Approved:"
  summarySheet.getCell("B12").value = leaveStats.byStatus.approved

  summarySheet.getCell("A13").value = "Rejected:"
  summarySheet.getCell("B13").value = leaveStats.byStatus.rejected

  summarySheet.getCell("A15").value = "By Type"
  summarySheet.getCell("A15").font = { bold: true }

  summarySheet.getCell("A16").value = "Sick:"
  summarySheet.getCell("B16").value = leaveStats.byType.sick

  summarySheet.getCell("A17").value = "Vacation:"
  summarySheet.getCell("B17").value = leaveStats.byType.vacation

  summarySheet.getCell("A18").value = "Personal:"
  summarySheet.getCell("B18").value = leaveStats.byType.personal

  summarySheet.getCell("A19").value = "Other:"
  summarySheet.getCell("B19").value = leaveStats.byType.other

  summarySheet.getCell("A21").value = "By Department"
  summarySheet.getCell("A21").font = { bold: true }

  let row = 22
  Object.entries(leaveStats.byDepartment).forEach(([dept, count]) => {
    summarySheet.getCell(`A${row}`).value = `${dept}:`
    summarySheet.getCell(`B${row}`).value = count
    row++
  })

  // Create details worksheet
  const detailsSheet = workbook.addWorksheet("Leave Requests")

  // Add headers
  detailsSheet.columns = [
    { header: "Employee", key: "employee", width: 30 },
    { header: "Department", key: "department", width: 20 },
    { header: "Type", key: "type", width: 15 },
    { header: "Start Date", key: "startDate", width: 15 },
    { header: "End Date", key: "endDate", width: 15 },
    { header: "Status", key: "status", width: 15 },
    { header: "Approved By", key: "approvedBy", width: 20 },
    { header: "Reason", key: "reason", width: 40 },
  ]

  // Style header row
  detailsSheet.getRow(1).font = { bold: true }

  // Add data
  leaveRequests.forEach((request) => {
    detailsSheet.addRow({
      employee: request.user_name,
      department: request.department,
      type: request.type,
      startDate: format(new Date(request.start_date), "yyyy-MM-dd"),
      endDate: format(new Date(request.end_date), "yyyy-MM-dd"),
      status: request.status,
      approvedBy: request.approved_by_name || "",
      reason: request.reason,
    })
  })

  // Save workbook
  await workbook.xlsx.writeFile(filePath)

  return filePath
}

/**
 * Generate payroll report PDF
 * @param {Array} payrollItems - Payroll items
 * @param {Object} totals - Payroll totals
 * @param {Object} payrollPeriod - Payroll period
 * @param {string} department - Department filter
 * @returns {string} - File path
 */
async function generatePayrollPDF(payrollItems, totals, payrollPeriod, department) {
  // Create directory if it doesn't exist
  const uploadsDir = path.join(__dirname, "../../uploads/reports")
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  // Create PDF document
  const filePath = path.join(uploadsDir, `payroll-report-${payrollPeriod.name.replace(/\s+/g, "-")}-${Date.now()}.pdf`)
  const doc = new PDFDocument({ margin: 50 })

  // Pipe to file
  const writeStream = fs.createWriteStream(filePath)
  doc.pipe(writeStream)

  // Add title
  doc.fontSize(20).text("Payroll Report", { align: "center" })
  doc.moveDown()

  // Add report period
  doc.fontSize(12).text(`Period: ${payrollPeriod.name}`, { align: "center" })
  doc.fontSize(12).text(`Status: ${payrollPeriod.status}`, { align: "center" })
  if (department) {
    doc.fontSize(12).text(`Department: ${department}`, { align: "center" })
  }
  doc.moveDown(2)

  // Add summary
  doc.fontSize(16).text("Summary", { underline: true })
  doc.moveDown()

  doc.fontSize(12).text(`Total Employees: ${payrollItems.length}`)
  doc.fontSize(12).text(`Total Gross Salary: ${formatCurrency(totals.totalGrossSalary)}`)
  doc.fontSize(12).text(`Total Net Salary: ${formatCurrency(totals.totalNetSalary)}`)
  doc.fontSize(12).text(`Total Bonuses: ${formatCurrency(totals.totalBonuses)}`)
  doc.fontSize(12).text(`Total Deductions: ${formatCurrency(totals.totalDeductions)}`)
  doc.fontSize(12).text(`Total Absence Deductions: ${formatCurrency(totals.totalAbsenceDeduction)}`)
  doc.moveDown(2)

  // Add payroll details
  doc.fontSize(16).text("Payroll Details", { underline: true })
  doc.moveDown()

  // Table header
  const tableTop = doc.y
  const tableLeft = 50

  doc.fontSize(10).text("Employee", tableLeft, tableTop)
  doc.text("Department", tableLeft + 120, tableTop)
  doc.text("Gross", tableLeft + 200, tableTop)
  doc.text("Deductions", tableLeft + 260, tableTop)
  doc.text("Net", tableLeft + 330, tableTop)
  doc.text("Status", tableLeft + 390, tableTop)

  doc
    .moveTo(tableLeft, tableTop + 15)
    .lineTo(tableLeft + 450, tableTop + 15)
    .stroke()

  // Table rows
  let rowTop = tableTop + 20

  payrollItems.forEach((item, index) => {
    // Check if we need a new page
    if (rowTop > doc.page.height - 100) {
      doc.addPage()
      rowTop = 50

      // Add header to new page
      doc.fontSize(10).text("Employee", tableLeft, rowTop)
      doc.text("Department", tableLeft + 120, rowTop)
      doc.text("Gross", tableLeft + 200, rowTop)
      doc.text("Deductions", tableLeft + 260, rowTop)
      doc.text("Net", tableLeft + 330, rowTop)
      doc.text("Status", tableLeft + 390, rowTop)

      doc
        .moveTo(tableLeft, rowTop + 15)
        .lineTo(tableLeft + 450, rowTop + 15)
        .stroke()

      rowTop += 20
    }

    const totalDeductions = Number.parseFloat(item.deductions) + Number.parseFloat(item.absence_deduction)

    doc.fontSize(10).text(item.user_name, tableLeft, rowTop)
    doc.text(item.department || "", tableLeft + 120, rowTop)
    doc.text(formatCurrency(item.gross_salary, item.currency), tableLeft + 200, rowTop)
    doc.text(formatCurrency(totalDeductions, item.currency), tableLeft + 260, rowTop)
    doc.text(formatCurrency(item.net_salary, item.currency), tableLeft + 330, rowTop)
    doc.text(item.status, tableLeft + 390, rowTop)

    rowTop += 20
  })

  // Add footer
  doc.fontSize(10).text(`Report generated on ${format(new Date(), "MMMM d, yyyy HH:mm")}`, { align: "center" })

  // Finalize PDF
  doc.end()

  // Wait for file to be written
  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => resolve(filePath))
    writeStream.on("error", reject)
  })
}

/**
 * Generate payroll report Excel
 * @param {Array} payrollItems - Payroll items
 * @param {Object} totals - Payroll totals
 * @param {Object} payrollPeriod - Payroll period
 * @param {string} department - Department filter
 * @returns {string} - File path
 */
async function generatePayrollExcel(payrollItems, totals, payrollPeriod, department) {
  // Create directory if it doesn't exist
  const uploadsDir = path.join(__dirname, "../../uploads/reports");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const filePath = path.join(uploadsDir, `payroll-report-${payrollPeriod.name.replace(/\s+/g, "-")}-${Date.now()}.xlsx`);
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "HR System";
  workbook.created = new Date();
  workbook.modified = new Date();

  const summarySheet = workbook.addWorksheet("Summary");

  summarySheet.mergeCells("A1:E1");
  summarySheet.getCell("A1").value = "Payroll Report";
  summarySheet.getCell("A1").font = { size: 16, bold: true };
  summarySheet.getCell("A1").alignment = { horizontal: "center" };

  summarySheet.mergeCells("A2:E2");
  summarySheet.getCell("A2").value = `Period: ${payrollPeriod.name}`;
  summarySheet.getCell("A2").alignment = { horizontal: "center" };

  summarySheet.mergeCells("A3:E3");
  summarySheet.getCell("A3").value = `Status: ${payrollPeriod.status}`;
  summarySheet.getCell("A3").alignment = { horizontal: "center" };

  if (department) {
    summarySheet.mergeCells("A4:E4");
    summarySheet.getCell("A4").value = `Department: ${department}`;
    summarySheet.getCell("A4").alignment = { horizontal: "center" };
  }

  summarySheet.getCell("A6").value = "Summary";
  summarySheet.getCell("A6").font = { size: 14, bold: true };

  summarySheet.getCell("A8").value = "Total Employees:";
  summarySheet.getCell("B8").value = payrollItems.length;

  summarySheet.getCell("A9").value = "Total Gross Salary:";
  summarySheet.getCell("B9").value = safeNumber(totals.totalGrossSalary);
  summarySheet.getCell("B9").numFmt = "$#,##0.00";

  summarySheet.getCell("A10").value = "Total Net Salary:";
  summarySheet.getCell("B10").value = safeNumber(totals.totalNetSalary);
  summarySheet.getCell("B10").numFmt = "$#,##0.00";

  summarySheet.getCell("A11").value = "Total Bonuses:";
  summarySheet.getCell("B11").value = safeNumber(totals.totalBonuses);
  summarySheet.getCell("B11").numFmt = "$#,##0.00";

  summarySheet.getCell("A12").value = "Total Deductions:";
  summarySheet.getCell("B12").value = safeNumber(totals.totalDeductions);
  summarySheet.getCell("B12").numFmt = "$#,##0.00";

  summarySheet.getCell("A13").value = "Total Absence Deductions:";
  summarySheet.getCell("B13").value = safeNumber(totals.totalAbsenceDeduction);
  summarySheet.getCell("B13").numFmt = "$#,##0.00";

  const detailsSheet = workbook.addWorksheet("Payroll Details");

  detailsSheet.columns = [
    { header: "Employee", key: "employee", width: 30 },
    { header: "Department", key: "department", width: 20 },
    { header: "Position", key: "position", width: 20 },
    { header: "Base Salary", key: "baseSalary", width: 15 },
    { header: "Bonuses", key: "bonuses", width: 15 },
    { header: "Deductions", key: "deductions", width: 15 },
    { header: "Absence Deduction", key: "absenceDeduction", width: 20 },
    { header: "Gross Salary", key: "grossSalary", width: 15 },
    { header: "Net Salary", key: "netSalary", width: 15 },
    { header: "Status", key: "status", width: 15 },
  ];

  detailsSheet.getRow(1).font = { bold: true };

  payrollItems.forEach((item) => {
    const row = detailsSheet.addRow({
      employee: item.user_name,
      department: item.department || "",
      position: item.position || "",
      baseSalary: parseFloat(item.base_salary) || 0,
      bonuses: parseFloat(item.bonuses) || 0,
      deductions: parseFloat(item.deductions) || 0,
      absenceDeduction: parseFloat(item.absence_deduction) || 0,
      grossSalary: parseFloat(item.gross_salary) || 0,
      netSalary: parseFloat(item.net_salary) || 0,
      status: item.status,
    });

    row.getCell("baseSalary").numFmt = "$#,##0.00";
    row.getCell("bonuses").numFmt = "$#,##0.00";
    row.getCell("deductions").numFmt = "$#,##0.00";
    row.getCell("absenceDeduction").numFmt = "$#,##0.00";
    row.getCell("grossSalary").numFmt = "$#,##0.00";
    row.getCell("netSalary").numFmt = "$#,##0.00";
  });

  const attendanceSheet = workbook.addWorksheet("Attendance Details");

  attendanceSheet.columns = [
    { header: "Employee", key: "employee", width: 30 },
    { header: "Department", key: "department", width: 20 },
    { header: "Working Days", key: "workingDays", width: 15 },
    { header: "Present Days", key: "presentDays", width: 15 },
    { header: "Absent Days", key: "absentDays", width: 15 },
    { header: "Paid Leave", key: "paidLeave", width: 15 },
    { header: "Unpaid Leave", key: "unpaidLeave", width: 15 },
  ];

  attendanceSheet.getRow(1).font = { bold: true };

  payrollItems.forEach((item) => {
    attendanceSheet.addRow({
      employee: item.user_name,
      department: item.department || "",
      workingDays: parseInt(item.working_days, 10) || 0,
      presentDays: parseInt(item.present_days, 10) || 0,
      absentDays: parseInt(item.absent_days, 10) || 0,
      paidLeave: parseInt(item.paid_leave_days, 10) || 0,
      unpaidLeave: parseInt(item.unpaid_leave_days, 10) || 0,
    });
  });

  await workbook.xlsx.writeFile(filePath);
  return filePath;
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
