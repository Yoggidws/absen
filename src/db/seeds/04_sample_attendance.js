const { v4: uuidv4 } = require("uuid")

/**
 * Seed file to create sample attendance records
 */
exports.seed = async (knex) => {
  // Check if attendance table is empty
  const attendanceCount = await knex("attendance").count("id as count").first()

  if (Number.parseInt(attendanceCount.count) === 0) {
    // Get all active employees
    const employees = await knex("users").where({ active: true }).whereNot({ role: "admin" }).select("id")

    if (employees.length === 0) {
      console.log("No employees found to create attendance records")
      return
    }

    const attendanceRecords = []
    const now = new Date()

    // Create attendance records for the past 7 days
    for (let day = 0; day < 7; day++) {
      const date = new Date(now)
      date.setDate(date.getDate() - day)

      // Skip weekends (0 = Sunday, 6 = Saturday)
      const dayOfWeek = date.getDay()
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        continue
      }

      // For each employee
      for (const employee of employees) {
        // Some randomization for more realistic data
        const shouldHaveRecord = Math.random() > 0.1 // 90% attendance rate

        if (shouldHaveRecord) {
          // Check-in time (around 9 AM with some variation)
          const checkInHour = 8 + Math.floor(Math.random() * 2) // 8-9 AM
          const checkInMinute = Math.floor(Math.random() * 60)
          const checkInDate = new Date(date)
          checkInDate.setHours(checkInHour, checkInMinute, 0, 0)

          // Check-out time (around 5 PM with some variation)
          const checkOutHour = 16 + Math.floor(Math.random() * 2) // 4-5 PM
          const checkOutMinute = Math.floor(Math.random() * 60)
          const checkOutDate = new Date(date)
          checkOutDate.setHours(checkOutHour, checkOutMinute, 0, 0)

          // QR code IDs - ensure they're shorter than 50 chars
          const dateStr = date.toISOString().split("T")[0]
          const checkInQrId = `qr-${dateStr}-in-${employee.id.substring(0, 8)}`
          const checkOutQrId = `qr-${dateStr}-out-${employee.id.substring(0, 8)}`

          // Sample location (office coordinates)
          const location = {
            latitude: 37.7749 + (Math.random() * 0.01 - 0.005),
            longitude: -122.4194 + (Math.random() * 0.01 - 0.005),
          }

          // Shorter device info to avoid potential issues
          const deviceInfo = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X)"

          // Create check-in record
          attendanceRecords.push({
            id: "ATT-" + uuidv4().substring(0, 8),
            user_id: employee.id,
            type: "check-in",
            timestamp: checkInDate,
            qr_id: checkInQrId,
            location: JSON.stringify(location),
            ip_address: "192.168.1." + Math.floor(Math.random() * 255),
            device_info: deviceInfo,
            status: Math.random() > 0.9 ? "suspicious" : "valid", // 10% suspicious
            notes: null,
          })

          // Create check-out record
          attendanceRecords.push({
            id: "ATT-" + uuidv4().substring(0, 8),
            user_id: employee.id,
            type: "check-out",
            timestamp: checkOutDate,
            qr_id: checkOutQrId,
            location: JSON.stringify(location),
            ip_address: "192.168.1." + Math.floor(Math.random() * 255),
            device_info: deviceInfo,
            status: "valid",
            notes: null,
          })
        }
      }
    }

    // Insert records in smaller chunks to avoid memory issues
    const chunkSize = 50
    for (let i = 0; i < attendanceRecords.length; i += chunkSize) {
      const chunk = attendanceRecords.slice(i, i + chunkSize)
      await knex("attendance").insert(chunk)
    }

    console.log(`Created ${attendanceRecords.length} sample attendance records`)
  }
}
