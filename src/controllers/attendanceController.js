const crypto = require("crypto")
const QRCode = require("qrcode")
const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const geoUtils = require("../utils/geoUtils")
const emailUtils = require("../utils/emailUtils")

// Store active QR codes with expiration
const activeQRCodes = new Map()

// @desc    Generate a QR code for attendance
// @route   GET /api/attendance/qrcode
// @access  Private/Admin
exports.generateQRCode = asyncHandler(async (req, res) => {
  // Only admins can generate QR codes
  if (req.user.role !== "admin") {
    res.status(403)
    throw new Error("Only admins can generate QR codes")
  }

  // Generate a unique ID for this QR code
  const qrId = "QR-" + Math.random().toString(36).substring(2, 10).toUpperCase()

  // Store the QR ID with creation time (expires in 30 seconds)
  activeQRCodes.set(qrId, {
    createdAt: Date.now(),
    expiresAt: Date.now() + 30000, // 30 seconds
    createdBy: req.user.id,
  })

  // Generate QR code as base64 image
  const qrImage = await QRCode.toDataURL(qrId)

  // Clean up expired QR codes
  cleanupExpiredQRCodes()

  res.status(200).json({
    success: true,
    qrId,
    qrImage,
  })
})

// @desc    Scan QR code for attendance
// @route   POST /api/attendance/scan
// @access  Private
exports.scanQRCode = asyncHandler(async (req, res) => {
  const { qrId, location, deviceInfo } = req.body

  if (!qrId) {
    res.status(400)
    throw new Error("QR code ID is required")
  }

  // Check if QR code exists and is valid
  const qrData = activeQRCodes.get(qrId)
  if (!qrData) {
    res.status(400)
    throw new Error("Invalid or expired QR code")
  }

  // Check if QR code has expired
  if (Date.now() > qrData.expiresAt) {
    activeQRCodes.delete(qrId)
    res.status(400)
    throw new Error("QR code has expired")
  }

  // Get user from request (set by auth middleware)
  const userId = req.user.id

  // Determine check-in or check-out based on last record
  const lastAttendance = await db("attendance").where({ user_id: userId }).orderBy("timestamp", "desc").first()

  const type = !lastAttendance || lastAttendance.type === "check-out" ? "check-in" : "check-out"

  // Get client IP address
  const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress

  // Generate a unique ID for this attendance record
  const attendanceId = "ATT-" + Math.random().toString(36).substring(2, 10).toUpperCase()

  // Prepare attendance data
  const attendanceData = {
    id: attendanceId,
    user_id: userId,
    type,
    qr_id: qrId,
    location: location ? JSON.stringify(location) : null,
    ip_address: ipAddress,
    device_info: deviceInfo,
    status: "valid",
  }

  // Validate location if provided
  if (location && location.latitude && location.longitude) {
    const isLocationValid = geoUtils.isLocationValid(
      location,
      Number.parseFloat(process.env.OFFICE_LATITUDE),
      Number.parseFloat(process.env.OFFICE_LONGITUDE),
      Number.parseFloat(process.env.MAX_DISTANCE_METERS),
    )

    attendanceData.status = isLocationValid ? "valid" : "suspicious"

    if (!isLocationValid) {
      attendanceData.notes = "Location is outside the allowed radius"
    }
  }

  // Create attendance record
  const [attendance] = await db("attendance").insert(attendanceData).returning("*")

  // Return success response
  res.status(200).json({
    success: true,
    message: `${type === "check-in" ? "Check-in" : "Check-out"} successful`,
    attendance,
  })
})

// @desc    Get attendance history for a user
// @route   GET /api/attendance/history
// @access  Private
exports.getAttendanceHistory = asyncHandler(async (req, res) => {
  const userId = req.params.userId || req.user.id

  // Check if user is requesting their own data or is an admin
  if (userId !== req.user.id && req.user.role !== "admin") {
    res.status(403)
    throw new Error("You can only access your own attendance records")
  }

  // Query parameters for filtering
  const { startDate, endDate, type, status } = req.query

  // Start building query
  let query = db("attendance").where({ user_id: userId }).orderBy("timestamp", "desc")

  // Apply filters if provided
  if (startDate) {
    query = query.where("timestamp", ">=", new Date(startDate))
  }

  if (endDate) {
    query = query.where("timestamp", "<=", new Date(endDate))
  }

  if (type) {
    query = query.where({ type })
  }

  if (status) {
    query = query.where({ status })
  }

  // Execute query
  const attendance = await query

  res.status(200).json({
    success: true,
    count: attendance.length,
    data: attendance,
  })
})

// @desc    Get attendance summary for a user
// @route   GET /api/attendance/summary
// @access  Private
exports.getAttendanceSummary = asyncHandler(async (req, res) => {
  const userId = req.params.userId || req.user.id

  // Check if user is requesting their own data or is an admin
  if (userId !== req.user.id && req.user.role !== "admin") {
    res.status(403)
    throw new Error("You can only access your own attendance records")
  }

  // Query parameters for filtering
  const { month, year } = req.query

  // Set default to current month and year if not provided
  const currentDate = new Date()
  const targetMonth = month ? Number.parseInt(month) - 1 : currentDate.getMonth()
  const targetYear = year ? Number.parseInt(year) : currentDate.getFullYear()

  // Calculate start and end date for the month
  const startDate = new Date(targetYear, targetMonth, 1)
  const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59)

  // Get all attendance records for the month
  const attendanceRecords = await db("attendance")
    .where({ user_id: userId })
    .whereBetween("timestamp", [startDate, endDate])
    .orderBy("timestamp", "asc")

  // Calculate summary statistics
  const totalDays = endDate.getDate()
  const workingDays = getWorkingDaysInMonth(targetYear, targetMonth)

  // Group attendance by day
  const attendanceByDay = {}
  attendanceRecords.forEach((record) => {
    const day = new Date(record.timestamp).getDate()
    if (!attendanceByDay[day]) {
      attendanceByDay[day] = []
    }
    attendanceByDay[day].push(record)
  })

  // Calculate present days, late days, etc.
  let presentDays = 0
  let lateDays = 0
  let earlyDepartures = 0
  let totalWorkHours = 0

  // Define work hours (e.g., 9 AM to 5 PM)
  const workStartHour = 9
  const workEndHour = 17

  Object.keys(attendanceByDay).forEach((day) => {
    const dayRecords = attendanceByDay[day]
    const checkIns = dayRecords.filter((r) => r.type === "check-in")
    const checkOuts = dayRecords.filter((r) => r.type === "check-out")

    if (checkIns.length > 0 && checkOuts.length > 0) {
      presentDays++

      // Check for late arrival
      const firstCheckIn = new Date(checkIns[0].timestamp)
      if (
        firstCheckIn.getHours() > workStartHour ||
        (firstCheckIn.getHours() === workStartHour && firstCheckIn.getMinutes() > 15)
      ) {
        lateDays++
      }

      // Check for early departure
      const lastCheckOut = new Date(checkOuts[checkOuts.length - 1].timestamp)
      if (lastCheckOut.getHours() < workEndHour) {
        earlyDepartures++
      }

      // Calculate work hours for the day
      const workHours = (lastCheckOut - firstCheckIn) / (1000 * 60 * 60)
      totalWorkHours += Math.min(workHours, 8) // Cap at 8 hours per day
    }
  })

  // Calculate absence
  const absentDays = workingDays - presentDays

  // Prepare summary
  const summary = {
    month: targetMonth + 1,
    year: targetYear,
    totalDays,
    workingDays,
    presentDays,
    absentDays,
    lateDays,
    earlyDepartures,
    totalWorkHours: Math.round(totalWorkHours * 10) / 10, // Round to 1 decimal place
    attendanceRate: Math.round((presentDays / workingDays) * 100),
  }

  res.status(200).json({
    success: true,
    summary,
  })
})

// @desc    Get attendance statistics
// @route   GET /api/attendance/stats
// @access  Private/Admin
exports.getAttendanceStats = asyncHandler(async (req, res) => {
  // Only admins can access this endpoint
  if (req.user.role !== "admin") {
    res.status(403)
    throw new Error("Only admins can access attendance statistics")
  }

  const { startDate, endDate, department } = req.query

  // Set default date range to current month if not provided
  const currentDate = new Date()
  const defaultStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const defaultEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59)

  const start = startDate ? new Date(startDate) : defaultStartDate
  const end = endDate ? new Date(endDate) : defaultEndDate

  // Start building user query
  let userQuery = db("users").where({ active: true })

  if (department) {
    userQuery = userQuery.where({ department })
  }

  // Get all active users
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
      department: user.department,
      presentDays,
      absentDays: workingDays - presentDays,
      lateDays,
      attendanceRate: Math.round((presentDays / workingDays) * 100),
    }
  })

  // Calculate department statistics
  const departmentStats = {}
  userStats.forEach((stat) => {
    const dept = stat.department || "Unassigned"

    if (!departmentStats[dept]) {
      departmentStats[dept] = {
        totalUsers: 0,
        presentDays: 0,
        absentDays: 0,
        lateDays: 0,
      }
    }

    departmentStats[dept].totalUsers++
    departmentStats[dept].presentDays += stat.presentDays
    departmentStats[dept].absentDays += stat.absentDays
    departmentStats[dept].lateDays += stat.lateDays
  })

  // Calculate overall statistics
  const totalUsers = users.length
  const totalPresentDays = userStats.reduce((sum, stat) => sum + stat.presentDays, 0)
  const totalWorkingDays = totalUsers * workingDays
  const overallAttendanceRate = Math.round((totalPresentDays / totalWorkingDays) * 100)

  // Prepare response
  const stats = {
    period: {
      startDate: start,
      endDate: end,
      workingDays,
    },
    overall: {
      totalUsers,
      attendanceRate: overallAttendanceRate,
      presentDays: totalPresentDays,
      absentDays: totalWorkingDays - totalPresentDays,
    },
    departments: departmentStats,
    users: userStats,
  }

  res.status(200).json({
    success: true,
    stats,
  })
})

// Helper function to clean up expired QR codes
function cleanupExpiredQRCodes() {
  const now = Date.now()
  for (const [qrId, data] of activeQRCodes.entries()) {
    if (now > data.expiresAt) {
      activeQRCodes.delete(qrId)
    }
  }
}

// Helper function to calculate working days in a month
function getWorkingDaysInMonth(year, month) {
  const startDate = new Date(year, month, 1)
  const endDate = new Date(year, month + 1, 0)

  return getWorkingDaysInPeriod(startDate, endDate)
}

// Helper function to calculate working days in a period
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
