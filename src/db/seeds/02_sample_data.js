const bcrypt = require("bcryptjs")
const { generateId } = require("../../utils/idGenerator")
const { v4: uuidv4 } = require("uuid")

/**
 * Consolidated sample data seed
 * Creates sample employees, attendance, leave requests, and leave balance
 */
exports.seed = async (knex) => {
  // Only seed if we have fewer than 2 users (just the admin)
  const userCount = await knex("users").count("id as count").first()

  if (Number.parseInt(userCount.count) <= 1) {
    // Create sample employees
    const salt = await bcrypt.genSalt(12)
    const hashedPassword = await bcrypt.hash("Employee@123", salt)

    const employeeData = [
      {
        id: generateId("", 9),
        name: "John Manager",
        email: "manager@example.com",
        password: hashedPassword,
        role: "manager",
        department: "Engineering",
        position: "Engineering Manager",
        active: true,
      },
      {
        id: generateId("", 10),
        name: "Alice Developer",
        email: "alice@example.com",
        password: hashedPassword,
        role: "employee",
        department: "Engineering",
        position: "Senior Developer",
        active: true,
      },
      {
        id: generateId("", 11),
        name: "Bob Designer",
        email: "bob@example.com",
        password: hashedPassword,
        role: "employee",
        department: "Marketing",
        position: "UI/UX Designer",
        active: true,
      },
      {
        id: generateId("", 12),
        name: "Carol HR",
        email: "carol@example.com",
        password: hashedPassword,
        role: "hr",
        department: "Human Resources",
        position: "HR Manager",
        active: true,
      },
      {
        id: generateId("", 13),
        name: "Dave Sales",
        email: "dave@example.com",
        password: hashedPassword,
        role: "employee",
        department: "Sales",
        position: "Sales Representative",
        active: true,
      },
      {
        id: generateId("", 14),
        name: "Eve Finance",
        email: "eve@example.com",
        password: hashedPassword,
        role: "payroll",
        department: "Finance",
        position: "Financial Analyst",
        active: true,
      },
    ]

    await knex("users").insert(employeeData)
    console.log("Created sample employees")

    // Assign roles to users
    const userRoles = [
      { user_id: employeeData[0].id, role_id: "role_manager" },
      { user_id: employeeData[1].id, role_id: "role_employee" },
      { user_id: employeeData[2].id, role_id: "role_employee" },
      { user_id: employeeData[3].id, role_id: "role_hr" },
      { user_id: employeeData[4].id, role_id: "role_employee" },
      { user_id: employeeData[5].id, role_id: "role_payroll" },
    ]

    await knex("user_roles").insert(userRoles)
    console.log("Assigned roles to sample employees")
  }

  // Create leave balance for all active users
  const existingLeaveBalance = await knex("leave_balance").select("*").limit(1)
  if (existingLeaveBalance.length === 0) {
    const users = await knex("users").where({ active: true }).select("id")
    const currentYear = new Date().getFullYear()
    
    const leaveBalanceRecords = users.map(user => ({
      id: `LB-${uuidv4().substring(0, 8).toUpperCase()}`,
      user_id: user.id,
      year: currentYear,
      annual_leave: 20,
      sick_leave: 10,
      other_leave: 5,
      long_leave: 90,
      maternity_leave: 90,
      paternity_leave: 14,
      marriage_leave: 3,
      death_leave: 2,
      hajj_umrah_leave: 30,
      created_at: new Date(),
      updated_at: new Date()
    }))
    
    await knex("leave_balance").insert(leaveBalanceRecords)
    console.log("Created leave balance records")
  }

  // Create sample attendance records
  const attendanceCount = await knex("attendance").count("id as count").first()
  if (Number.parseInt(attendanceCount.count) === 0) {
    const employees = await knex("users").where({ active: true }).whereNot({ role: "admin" }).select("id")
    
    if (employees.length > 0) {
      const attendanceRecords = []
      const now = new Date()

      // Create attendance records for the past 7 days
      for (let day = 0; day < 7; day++) {
        const date = new Date(now)
        date.setDate(date.getDate() - day)

        // Skip weekends
        const dayOfWeek = date.getDay()
        if (dayOfWeek === 0 || dayOfWeek === 6) continue

        for (const employee of employees) {
          if (Math.random() > 0.1) { // 90% attendance rate
            // Check-in
            const checkInHour = 8 + Math.floor(Math.random() * 2)
            const checkInMinute = Math.floor(Math.random() * 60)
            const checkInDate = new Date(date)
            checkInDate.setHours(checkInHour, checkInMinute, 0, 0)

            // Check-out
            const checkOutHour = 16 + Math.floor(Math.random() * 2)
            const checkOutMinute = Math.floor(Math.random() * 60)
            const checkOutDate = new Date(date)
            checkOutDate.setHours(checkOutHour, checkOutMinute, 0, 0)

            const dateStr = date.toISOString().split("T")[0]
            const location = {
              latitude: 37.7749 + (Math.random() * 0.01 - 0.005),
              longitude: -122.4194 + (Math.random() * 0.01 - 0.005),
            }

            attendanceRecords.push(
              {
                id: "ATT-" + uuidv4().substring(0, 8),
                user_id: employee.id,
                type: "check-in",
                timestamp: checkInDate,
                qr_id: `qr-${dateStr}-in-${employee.id.substring(0, 8)}`,
                location: JSON.stringify(location),
                ip_address: "192.168.1." + Math.floor(Math.random() * 255),
                device_info: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X)",
                status: Math.random() > 0.9 ? "suspicious" : "valid",
                notes: null,
              },
              {
                id: "ATT-" + uuidv4().substring(0, 8),
                user_id: employee.id,
                type: "check-out",
                timestamp: checkOutDate,
                qr_id: `qr-${dateStr}-out-${employee.id.substring(0, 8)}`,
                location: JSON.stringify(location),
                ip_address: "192.168.1." + Math.floor(Math.random() * 255),
                device_info: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X)",
                status: "valid",
                notes: null,
              }
            )
          }
        }
      }

      // Insert in chunks
      const chunkSize = 50
      for (let i = 0; i < attendanceRecords.length; i += chunkSize) {
        const chunk = attendanceRecords.slice(i, i + chunkSize)
        await knex("attendance").insert(chunk)
      }

      console.log(`Created ${attendanceRecords.length} sample attendance records`)
    }
  }

  // Create sample leave requests
  const leaveCount = await knex("leave_requests").count("id as count").first()
  if (Number.parseInt(leaveCount.count) === 0) {
    const employees = await knex("users").where({ active: true }).whereNot({ role: "admin" }).select("id")
    const managers = await knex("users").where({ role: "manager", active: true }).select("id")

    if (employees.length > 0) {
      const leaveRequests = []
      const now = new Date()
      const leaveTypes = ["annual", "sick", "long"]
      const statuses = ["pending", "approved", "rejected"]

      for (const employee of employees) {
        const numRequests = Math.floor(Math.random() * 3) + 1 // 1-3 requests per employee

        for (let i = 0; i < numRequests; i++) {
          const leaveType = leaveTypes[Math.floor(Math.random() * leaveTypes.length)]
          const startOffset = Math.floor(Math.random() * 60)
          const startDate = new Date(now)
          startDate.setDate(startDate.getDate() + startOffset)

          const duration = Math.floor(Math.random() * 5) + 1
          const endDate = new Date(startDate)
          endDate.setDate(endDate.getDate() + duration - 1)

          const status = statuses[Math.floor(Math.random() * statuses.length)]
          let approvedBy = null
          let approvalNotes = null

          if (status !== "pending" && managers.length > 0) {
            approvedBy = managers[Math.floor(Math.random() * managers.length)].id
            approvalNotes = status === "approved" 
              ? "Approved. Enjoy your time off." 
              : "Rejected due to staffing constraints. Please reschedule."
          }

          leaveRequests.push({
            id: "LVE-" + uuidv4().substring(0, 8),
            user_id: employee.id,
            type: leaveType,
            start_date: startDate.toISOString().split("T")[0],
            end_date: endDate.toISOString().split("T")[0],
            reason: getReasonByLeaveType(leaveType),
            status: status,
            approved_by: approvedBy,
            approval_notes: approvalNotes,
            created_at: new Date(startDate.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          })
        }
      }

      if (leaveRequests.length > 0) {
        await knex("leave_requests").insert(leaveRequests)
        console.log(`Created ${leaveRequests.length} sample leave requests`)
      }
    }
  }

  return Promise.resolve()
}

// Helper function to generate realistic reasons based on leave type
function getReasonByLeaveType(type) {
  const reasons = {
    sick: [
      "Not feeling well, need to rest",
      "Doctor's appointment",
      "Recovering from flu",
      "Medical procedure",
      "Migraine",
    ],
    annual: [
      "Annual family vacation",
      "Taking some time off to recharge",
      "Visiting relatives",
      "Holiday trip",
      "Personal retreat",
    ],
    long: [
      "Extended medical treatment",
      "Family emergency abroad",
      "Personal sabbatical",
      "Educational program",
      "Long-term care for family member",
    ],
  }

  const typeReasons = reasons[type] || reasons.annual
  return typeReasons[Math.floor(Math.random() * typeReasons.length)]
} 