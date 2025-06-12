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
  // Permission check is handled by route middleware (hasPermission("manage:attendance"))
  
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
  try {
    console.log('=== getAttendanceHistory called ===');
    console.log('req.user:', req.user);
    console.log('req.params:', req.params);
    
    const userId = req.params.userId || req.user.id;
    console.log('Target userId:', userId);

    console.log('Permission check passed, proceeding with query...');

    // Query parameters for filtering
    const { startDate, endDate, type, status } = req.query;

    // Start building query with user join
    let query = db("attendance as a")
      .join("users as u", "a.user_id", "=", "u.id")
      .select(
        "a.*",
        "u.name as employee_name",
        "u.email",
        "u.department",
        "u.position"
      );

    // If admin with read all permission and no specific userId, get all records
    if (req.originalUrl.includes('/history/all') && req.hasPermission('read:attendance:all')) {
      console.log('Admin query: getting all records');
      // No user_id filter for admin viewing all records
    } else {
      // For /history/:userId or /history (own)
      const targetUserId = req.params.userId || req.user.id;
      console.log('User query: filtering by userId:', targetUserId);
      // Filter by specific user_id
      query = query.where("a.user_id", targetUserId);
    }

    // Order by timestamp
    query = query.orderBy("a.timestamp", "desc");

    // Apply filters if provided
    if (startDate) {
      query = query.where("a.timestamp", ">=", new Date(startDate));
    }

    if (endDate) {
      query = query.where("a.timestamp", "<=", new Date(endDate));
    }

    if (type) {
      query = query.where("a.type", type);
    }

    if (status) {
      query = query.where("a.status", status);
    }

    console.log('Executing database query...');
    
    // Execute query
    const attendance = await query;
    
    console.log('Query result:', attendance.length, 'records found');

    // Process records to include check-in/check-out status
    const processedAttendance = attendance.map(record => ({
      ...record,
      checkIn: record.type === "check-in",
      checkOut: record.type === "check-out",
      employeeName: record.employee_name,
      timestamp: record.timestamp,
      status: record.status || "recorded"
    }));

    console.log('Sending response...');

    res.status(200).json({
      success: true,
      count: processedAttendance.length,
      data: processedAttendance,
    });
  } catch (error) {
    console.error('Error in getAttendanceHistory:', error);
    console.error('Error stack:', error.stack);
    throw error; // Re-throw to be handled by asyncHandler
  }
})

// @desc    Get attendance summary for a user
// @route   GET /api/attendance/summary
// @access  Private
exports.getAttendanceSummary = asyncHandler(async (req, res) => {
  const userId = req.params.userId || req.user.id

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
  // Permission check is already handled by route middleware (hasPermission("read:attendance:all"))
  // No need for duplicate check here

  const { startDate, endDate, department } = req.query

  // Set default date range to current month if not provided
  const currentDate = new Date()
  const defaultStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const defaultEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59)

  const start = startDate ? new Date(startDate) : defaultStartDate
  const end = endDate ? new Date(endDate) : defaultEndDate

  // Start building user query with all necessary user information
  let userQuery = db("users")
    .select(
      "users.id",
      "users.name",
      "users.email",
      "users.department",
      "users.position"
    )
    .where({ active: true })

  if (department) {
    userQuery = userQuery.where({ department })
  }

  // Get all active users
  const users = await userQuery

  // Get attendance data for all users in the date range with user information
  const attendanceData = await db("attendance")
    .join("users", "attendance.user_id", "=", "users.id")
    .select(
      "attendance.*",
      "users.name as employee_name",
      "users.email",
      "users.department",
      "users.position"
    )
    .whereBetween("attendance.timestamp", [start, end])
    .orderBy("attendance.timestamp", "asc")

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

    // Get today's attendance status
    const today = new Date().toISOString().split("T")[0]
    const todayRecords = attendanceByDay[today] || []
    const lastRecord = todayRecords[todayRecords.length - 1]
    
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      position: user.position,
      employeeName: user.name,
      presentDays,
      absentDays: workingDays - presentDays,
      lateDays,
      attendanceRate: Math.round((presentDays / workingDays) * 100),
      status: lastRecord ? lastRecord.status || "recorded" : "absent",
      checkIn: todayRecords.some(r => r.type === "check-in"),
      checkOut: todayRecords.some(r => r.type === "check-out"),
      timestamp: lastRecord ? lastRecord.timestamp : null
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
  const totalAbsentDays = userStats.reduce((sum, stat) => sum + stat.absentDays, 0)
  const totalLateDays = userStats.reduce((sum, stat) => sum + stat.lateDays, 0)

  // Calculate today's statistics for dashboard
  const today = new Date().toISOString().split("T")[0]
  const todayAttendance = attendanceData.filter(record => 
    new Date(record.timestamp).toISOString().split("T")[0] === today
  )
  
  const presentToday = new Set(
    todayAttendance
      .filter(record => record.type === "check-in")
      .map(record => record.user_id)
  ).size

  const lateToday = todayAttendance.filter(record => {
    if (record.type === "check-in") {
      const checkInTime = new Date(record.timestamp)
      return checkInTime.getHours() > 9 || (checkInTime.getHours() === 9 && checkInTime.getMinutes() > 15)
    }
    return false
  }).length

  const overallStats = {
    totalUsers,
    averageAttendanceRate: Math.round((totalPresentDays / (totalPresentDays + totalAbsentDays)) * 100),
    totalPresentDays,
    totalAbsentDays,
    totalLateDays,
    presentToday,
    lateToday,
    departmentStats,
  }

  res.status(200).json({
    success: true,
    data: {
      userStats,
      overallStats,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        workingDays,
      },
    },
  })
})

// @desc    Get dashboard statistics
// @route   GET /api/attendance/dashboard-stats
// @access  Private
exports.getDashboardStats = asyncHandler(async (req, res) => {
  const userId = req.user.id

  // Use the new rbac helpers if they exist, otherwise fallback to old structure
  const canReadAll = req.hasPermission('read:attendance:all') || req.hasRole('admin');

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

  let stats = {
    totalEmployees: 0,
    presentToday: 0,
    onLeave: 0,
    lateToday: 0,
    attendanceRate: '0%',
    pendingApprovals: 0
  }

  try {
    if (canReadAll) {
      // Admin/HR users get organization-wide stats
      
      // Get total active employees
      const totalEmployeesResult = await db("users")
        .where({ active: true })
        .count("id as count")
        .first()
      
      stats.totalEmployees = parseInt(totalEmployeesResult.count) || 0

      // Get today's attendance
      const todayAttendance = await db("attendance")
        .whereBetween("timestamp", [startOfToday, endOfToday])
        .select("user_id", "type", "timestamp")

      // Calculate present today (users who checked in)
      const checkedInUsers = new Set(
        todayAttendance
          .filter(record => record.type === "check-in")
          .map(record => record.user_id)
      )
      stats.presentToday = checkedInUsers.size

      // Calculate late arrivals (check-in after 9:15 AM)
      stats.lateToday = todayAttendance.filter(record => {
        if (record.type === "check-in") {
          const checkInTime = new Date(record.timestamp)
          return checkInTime.getHours() > 9 || 
                 (checkInTime.getHours() === 9 && checkInTime.getMinutes() > 15)
        }
        return false
      }).length

      // Calculate attendance rate for current month
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const workingDaysThisMonth = getWorkingDaysInPeriod(startOfMonth, today)
      
      if (workingDaysThisMonth > 0) {
        const monthlyAttendance = await db("attendance")
          .whereBetween("timestamp", [startOfMonth, endOfToday])
          .where("type", "check-in")
          .distinct("user_id")
          .count("user_id as count")
          .first()
        
        const attendanceCount = parseInt(monthlyAttendance.count) || 0
        const expectedAttendance = stats.totalEmployees * workingDaysThisMonth
        stats.attendanceRate = expectedAttendance > 0 
          ? `${Math.round((attendanceCount / expectedAttendance) * 100)}%` 
          : '0%'
      }

    } else {
      // Regular employees get their own stats
      stats.totalEmployees = 1 // Just themselves
      
      // Check if user is present today
      const userTodayAttendance = await db("attendance")
        .where({ user_id: userId })
        .whereBetween("timestamp", [startOfToday, endOfToday])
        .orderBy("timestamp", "desc")
      
      stats.presentToday = userTodayAttendance.some(record => record.type === "check-in") ? 1 : 0
      
      // Check if user was late today
      const userCheckIn = userTodayAttendance.find(record => record.type === "check-in")
      if (userCheckIn) {
        const checkInTime = new Date(userCheckIn.timestamp)
        stats.lateToday = (checkInTime.getHours() > 9 || 
                          (checkInTime.getHours() === 9 && checkInTime.getMinutes() > 15)) ? 1 : 0
      }

      // Calculate user's monthly attendance rate
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const workingDaysThisMonth = getWorkingDaysInPeriod(startOfMonth, today)
      
      const userMonthlyAttendance = await db("attendance")
        .where({ user_id: userId })
        .whereBetween("timestamp", [startOfMonth, endOfToday])
        .where("type", "check-in")
        .distinct("user_id")
        .count("user_id as count")
        .first()
      
      const userAttendanceCount = parseInt(userMonthlyAttendance.count) || 0
      stats.attendanceRate = workingDaysThisMonth > 0 
        ? `${Math.round((userAttendanceCount / workingDaysThisMonth) * 100)}%` 
        : '0%'
    }

    // Get current leave requests (people currently on leave)
    const currentLeaveRequests = await db("leave_requests")
      .where("status", "approved")
      .where("start_date", "<=", today)
      .where("end_date", ">=", today)
      .count("id as count")
      .first()
    
    stats.onLeave = parseInt(currentLeaveRequests.count) || 0

    // Get pending leave approvals
    if (canReadAll || req.hasRole('manager') || req.hasPermission('approve:leave')) {
      const pendingLeaveRequests = await db("leave_requests")
        .where("status", "pending")
        .count("id as count")
        .first()
      
      stats.pendingApprovals = parseInt(pendingLeaveRequests.count) || 0
    }

    res.status(200).json({
      success: true,
      data: stats
    })

  } catch (error) {
    console.error("Error fetching dashboard stats:", error)
    res.status(200).json({
      success: true,
      data: stats // Return default stats even if there's an error
    })
  }
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
