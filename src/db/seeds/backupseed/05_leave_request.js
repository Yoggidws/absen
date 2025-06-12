const { v4: uuidv4 } = require("uuid")

/**
 * Seed file to create sample leave requests
 */
exports.seed = async (knex) => {
  // Check if leave_requests table exists and is empty
  try {
    const tableExists = await knex.schema.hasTable("leave_requests")
    if (!tableExists) {
      console.log("leave_requests table does not exist yet, skipping seed")
      return
    }

    const leaveCount = await knex("leave_requests").count("id as count").first()

    if (Number.parseInt(leaveCount.count) === 0) {
      // Get all active employees
      const employees = await knex("users").where({ active: true }).whereNot({ role: "admin" }).select("id")

      // Get managers for approvals
      const managers = await knex("users").where({ role: "manager", active: true }).select("id")

      if (employees.length === 0) {
        console.log("No employees found to create leave requests")
        return
      }

      const leaveRequests = []
      const now = new Date()
      const leaveTypes = ["annual", "sick", "other"]
      const statuses = ["pending", "approved", "rejected"]

      // Create some leave requests for each employee
      for (const employee of employees) {
        // Number of leave requests per employee (0-3)
        const numRequests = Math.floor(Math.random() * 4)

        for (let i = 0; i < numRequests; i++) {
          // Random leave type
          const leaveType = leaveTypes[Math.floor(Math.random() * leaveTypes.length)]

          // Random start date (between now and 60 days in the future)
          const startOffset = Math.floor(Math.random() * 60)
          const startDate = new Date(now)
          startDate.setDate(startDate.getDate() + startOffset)

          // Random duration (1-5 days)
          const duration = Math.floor(Math.random() * 5) + 1
          const endDate = new Date(startDate)
          endDate.setDate(endDate.getDate() + duration - 1)

          // Format dates as YYYY-MM-DD
          const formattedStartDate = startDate.toISOString().split("T")[0]
          const formattedEndDate = endDate.toISOString().split("T")[0]

          // Random status
          const status = statuses[Math.floor(Math.random() * statuses.length)]

          // If approved or rejected, assign a manager
          let approvedBy = null
          let approvalNotes = null

          if (status !== "pending" && managers.length > 0) {
            approvedBy = managers[Math.floor(Math.random() * managers.length)].id
            approvalNotes =
              status === "approved"
                ? "Approved. Enjoy your time off."
                : "Rejected due to staffing constraints. Please reschedule."
          }

          // Create leave request
          leaveRequests.push({
            id: "LVE-" + uuidv4().substring(0, 8),
            user_id: employee.id,
            type: leaveType,
            start_date: formattedStartDate,
            end_date: formattedEndDate,
            reason: getReasonByLeaveType(leaveType),
            status: status,
            approved_by: approvedBy,
            approval_notes: approvalNotes,
            created_at: new Date(startDate.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000), // 0-7 days before start date
          })
        }
      }

      // Insert all leave requests
      if (leaveRequests.length > 0) {
        await knex("leave_requests").insert(leaveRequests)
        console.log(`Created ${leaveRequests.length} sample leave requests`)
      }
    }
  } catch (error) {
    console.error("Error seeding leave requests:", error)
  }
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
    other: [
      "Professional development workshop",
      "Volunteering event",
      "Jury duty",
      "Vehicle maintenance",
      "Home repairs",
    ],
  }

  const typeReasons = reasons[type] || reasons.other
  return typeReasons[Math.floor(Math.random() * typeReasons.length)]
}
