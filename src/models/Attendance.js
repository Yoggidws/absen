const { db } = require("../config/db")
const geolib = require("geolib")

const Attendance = {
  /**
   * Find attendance record by ID
   * @param {string} id - Attendance ID
   * @returns {Promise<Object>} - Attendance record
   */
  findById: async (id) => {
    return await db("attendance").where({ id }).first()
  },

  /**
   * Find the last attendance record for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Last attendance record
   */
  findLastByUserId: async (userId) => {
    return await db("attendance").where({ user_id: userId }).orderBy("timestamp", "desc").first()
  },

  /**
   * Get attendance history for a user
   * @param {string} userId - User ID
   * @param {Object} filter - Filter criteria
   * @returns {Promise<Array>} - Attendance records
   */
  getHistory: async (userId, filter = {}) => {
    const query = db("attendance as a")
      .join("users as u", "a.user_id", "u.id")
      .select(
        "a.id",
        "a.type",
        "a.timestamp",
        "a.status",
        "a.location",
        "a.ip_address",
        "a.device_info",
        "a.notes",
        "u.name as user_name",
        "u.email as user_email",
      )
      .where("a.user_id", userId)

    // Apply filters if provided
    if (filter.startDate) {
      query.where("a.timestamp", ">=", filter.startDate)
    }

    if (filter.endDate) {
      query.where("a.timestamp", "<=", filter.endDate)
    }

    if (filter.type) {
      query.where("a.type", filter.type)
    }

    if (filter.status) {
      query.where("a.status", filter.status)
    }

    // Order by timestamp
    query.orderBy("a.timestamp", "desc")

    return await query
  },

  /**
   * Create a new attendance record
   * @param {Object} attendanceData - Attendance data
   * @returns {Promise<Object>} - Created attendance record
   */
  create: async (attendanceData) => {
    // Convert location to JSONB if provided
    let locationData = null
    if (attendanceData.location) {
      locationData = JSON.stringify(attendanceData.location)
    }

    // Insert attendance record
    const [id] = await db("attendance")
      .insert({
        user_id: attendanceData.userId,
        type: attendanceData.type,
        qr_id: attendanceData.qrId,
        location: locationData,
        ip_address: attendanceData.ipAddress,
        device_info: attendanceData.deviceInfo,
        status: attendanceData.status || "valid",
        notes: attendanceData.notes,
      })
      .returning("id")

    // Return created attendance record
    return await Attendance.findById(id)
  },

  /**
   * Get attendance summary for a user
   * @param {string} userId - User ID
   * @param {Object} filter - Filter criteria
   * @returns {Promise<Object>} - Attendance summary
   */
  getSummary: async (userId, filter = {}) => {
    // Default to current month if not provided
    const currentDate = new Date()
    const targetMonth = filter.month ? Number.parseInt(filter.month) - 1 : currentDate.getMonth()
    const targetYear = filter.year ? Number.parseInt(filter.year) : currentDate.getFullYear()

    // Create date range for the month
    const startDate = new Date(targetYear, targetMonth, 1)
    const endDate = new Date(targetYear, targetMonth + 1, 0)

    // Get all attendance records for the month
    const records = await db("attendance")
      .where("user_id", userId)
      .whereBetween("timestamp", [startDate, endDate])
      .orderBy("timestamp", "asc")

    // Process records to create daily summary
    const dailySummary = {}
    const daysInMonth = endDate.getDate()

    // Initialize all days in the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      dailySummary[dateStr] = {
        date: dateStr,
        checkIn: null,
        checkOut: null,
        status: "Absent",
        workDuration: 0,
      }
    }

    // Fill in actual attendance data
    records.forEach((record) => {
      const recordDate = new Date(record.timestamp)
      const dateStr = recordDate.toISOString().split("T")[0]

      if (dailySummary[dateStr]) {
        if (record.type === "check-in") {
          dailySummary[dateStr].checkIn = recordDate
          dailySummary[dateStr].status = "Present"
        } else if (record.type === "check-out") {
          dailySummary[dateStr].checkOut = recordDate
        }
      }
    })

    // Calculate work duration and determine status
    Object.values(dailySummary).forEach((day) => {
      if (day.checkIn && day.checkOut) {
        // Calculate duration in milliseconds
        const duration = day.checkOut - day.checkIn
        // Convert to hours
        day.workDuration = Math.round((duration / (1000 * 60 * 60)) * 10) / 10

        // Determine if late (check-in after 9:00 AM)
        const checkInHour = day.checkIn.getHours()
        const checkInMinute = day.checkIn.getMinutes()
        if (checkInHour > 9 || (checkInHour === 9 && checkInMinute > 0)) {
          day.status = "Late"
        }
      } else if (day.checkIn) {
        day.status = "Incomplete"
      }

      // Convert Date objects to strings for JSON response
      if (day.checkIn) day.checkIn = day.checkIn.toISOString()
      if (day.checkOut) day.checkOut = day.checkOut.toISOString()
    })

    // Calculate monthly statistics
    const stats = {
      totalDays: daysInMonth,
      presentDays: 0,
      absentDays: 0,
      lateDays: 0,
      incompleteDays: 0,
      totalWorkHours: 0,
    }

    Object.values(dailySummary).forEach((day) => {
      if (day.status === "Present") stats.presentDays++
      else if (day.status === "Absent") stats.absentDays++
      else if (day.status === "Late") {
        stats.lateDays++
        stats.presentDays++ // Late is still present
      } else if (day.status === "Incomplete") stats.incompleteDays++

      stats.totalWorkHours += day.workDuration
    })

    return {
      month: targetMonth + 1,
      year: targetYear,
      stats,
      dailySummary: Object.values(dailySummary),
    }
  },

  /**
   * Get attendance statistics
   * @param {Object} filter - Filter criteria
   * @returns {Promise<Object>} - Attendance statistics
   */
  getStats: async (filter = {}) => {
    // Default to current month if dates not provided
    const currentDate = new Date()
    const queryStartDate = filter.startDate
      ? new Date(filter.startDate)
      : new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const queryEndDate = filter.endDate
      ? new Date(filter.endDate)
      : new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

    // Get all users
    const usersQuery = db("users").select("id", "name", "email", "department", "position")

    // Add department filter if provided
    if (filter.department) {
      usersQuery.where("department", filter.department)
    }

    const users = await usersQuery

    // Get attendance records for all users in the date range
    const attendanceRecords = await db("attendance")
      .whereBetween("timestamp", [queryStartDate, queryEndDate])
      .orderBy("timestamp", "asc")

    // Process records to create statistics
    const stats = []
    const totalWorkdays = Math.round((queryEndDate - queryStartDate) / (1000 * 60 * 60 * 24)) + 1

    for (const user of users) {
      // Get user's attendance records
      const userRecords = attendanceRecords.filter((record) => record.user_id === user.id)

      // Group by date and type
      const recordsByDate = {}
      userRecords.forEach((record) => {
        const dateStr = new Date(record.timestamp).toISOString().split("T")[0]
        if (!recordsByDate[dateStr]) {
          recordsByDate[dateStr] = { checkIns: 0, checkOuts: 0 }
        }

        if (record.type === "check-in") {
          recordsByDate[dateStr].checkIns++
        } else {
          recordsByDate[dateStr].checkOuts++
        }
      })

      // Calculate statistics
      const daysPresent = Object.keys(recordsByDate).length
      const checkIns = userRecords.filter((record) => record.type === "check-in").length
      const checkOuts = userRecords.filter((record) => record.type === "check-out").length
      const attendanceRate = (daysPresent / totalWorkdays) * 100

      stats.push({
        userId: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        position: user.position,
        checkIns,
        checkOuts,
        daysPresent,
        attendanceRate: Number.parseFloat(attendanceRate.toFixed(2)),
      })
    }

    // Calculate overall statistics
    const totalEmployees = stats.length
    let totalPresent = 0
    let totalAbsent = 0

    stats.forEach((employee) => {
      totalPresent += employee.daysPresent
      totalAbsent += totalWorkdays - employee.daysPresent
    })

    const overallStats = {
      totalEmployees,
      totalWorkdays,
      totalPresent,
      totalAbsent,
      averageAttendanceRate: totalEmployees
        ? Number.parseFloat(((totalPresent / (totalEmployees * totalWorkdays)) * 100).toFixed(2))
        : 0,
    }

    return {
      dateRange: {
        startDate: queryStartDate,
        endDate: queryEndDate,
      },
      overallStats,
      employeeStats: stats,
    }
  },

  /**
   * Check if location is within allowed radius
   * @param {Object} location - Location coordinates
   * @param {number} officeLatitude - Office latitude
   * @param {number} officeLongitude - Office longitude
   * @param {number} maxDistance - Maximum allowed distance in meters
   * @returns {boolean} - Whether location is valid
   */
  isLocationValid: (location, officeLatitude, officeLongitude, maxDistance) => {
    if (!location || !location.latitude || !location.longitude) {
      return false
    }

    const distance = geolib.getDistance(
      { latitude: location.latitude, longitude: location.longitude },
      { latitude: officeLatitude, longitude: officeLongitude },
    )

    return distance <= maxDistance
  },
}

module.exports = Attendance
