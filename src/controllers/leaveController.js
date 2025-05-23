const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const emailUtils = require("../utils/emailUtils")
const leaveApprovalService = require("../services/leaveApprovalService")

// @desc    Create a new leave request
// @route   POST /api/leave
// @access  Private
exports.createLeaveRequest = asyncHandler(async (req, res) => {
  try {
    console.log("Creating leave request with data:", req.body);
    const { type, startDate, endDate, reason } = req.body
    const userId = req.user.id

    console.log("User ID:", userId);
    console.log("Leave type:", type);
    console.log("Start date:", startDate);
    console.log("End date:", endDate);
    console.log("Reason:", reason);

    // Validate leave type
    const validTypes = ["sick", "vacation", "personal", "other"]
    if (!validTypes.includes(type)) {
      console.log("Invalid leave type:", type);
      res.status(400)
      throw new Error(`Invalid leave type. Must be one of: ${validTypes.join(", ")}`)
    }

    // Validate dates
    if (!startDate || !endDate) {
      console.log("Missing dates - startDate:", startDate, "endDate:", endDate);
      res.status(400)
      throw new Error("Start date and end date are required")
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.log("Invalid date format - start:", start, "end:", end);
      res.status(400)
      throw new Error("Invalid date format. Please use YYYY-MM-DD format")
    }

    if (start > end) {
      console.log("Start date after end date - start:", start, "end:", end);
      res.status(400)
      throw new Error("Start date cannot be after end date")
    }

    // Prevent backdated leave requests
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Set to beginning of day for fair comparison

    if (start < today) {
      console.log("Backdated request - start:", start, "today:", today);
      res.status(400)
      throw new Error("Cannot request leave for past dates")
    }

    // Get employee details
    console.log("Fetching employee details for user ID:", userId);
    const employee = await db("users").where({ id: userId }).first()
    if (!employee) {
      console.log("Employee not found for user ID:", userId);
      res.status(404)
      throw new Error("Employee not found")
    }
    console.log("Found employee:", employee);

    // Calculate the number of days requested
    const diffTime = Math.abs(end - start)
    const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1 // +1 to include both start and end dates
    console.log("Requested days:", requestedDays);

    // Get current year
    const currentYear = new Date().getFullYear()

    // Get leave balance
    console.log("Fetching leave balance for year:", currentYear);
    let leaveBalance = await db("leave_balance")
      .where({
        user_id: userId,
        year: currentYear
      })
      .first()

    // If no leave balance record exists, create one
    if (!leaveBalance) {
      console.log("No leave balance found, creating new balance");
      const newLeaveBalanceId = `LB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`

      try {
        [leaveBalance] = await db("leave_balance")
          .insert({
            id: newLeaveBalanceId,
            user_id: userId,
            year: currentYear,
            annual_leave: 20,
            sick_leave: 10,
            other_leave: 5
          })
          .returning("*")
        console.log("Created new leave balance:", leaveBalance);
      } catch (error) {
        console.error("Error creating leave balance:", error);
        throw error;
      }
    }
    console.log("Current leave balance:", leaveBalance);

    // Check if requested days exceed available balance
    let availableBalance = 0
    switch (type) {
      case "annual":
        availableBalance = leaveBalance.annual_leave
        break
      case "sick":
        availableBalance = leaveBalance.sick_leave
        break
      case "other":
        availableBalance = leaveBalance.other_leave
        break
    }
    console.log("Available balance for", type, "leave:", availableBalance);

    if (requestedDays > availableBalance) {
      console.log("Insufficient balance - requested:", requestedDays, "available:", availableBalance);
      res.status(400)
      throw new Error(`Requested ${type} leave (${requestedDays} days) exceeds your available balance (${availableBalance} days)`)
    }

    // Find manager in the same department
    console.log("Finding manager for department:", employee.department);
    let manager = null;
    if (employee.department) {
      try {
        // First try to find department manager from departments table
        const department = await db("departments")
          .where({ name: employee.department })
          .first();
        console.log("Found department:", department);

        if (department && department.manager_id) {
          manager = await db("users")
            .where({ id: department.manager_id })
            .first();
          console.log("Found department manager:", manager);
        }

        // If no department manager found, find any manager in the same department
        if (!manager) {
          console.log("No department manager found, looking for any manager in department");
          manager = await db("users")
            .where({
              department: employee.department,
              role: "manager",
              active: true,
            })
            .first();
          console.log("Found department manager (alternative):", manager);
        }
      } catch (error) {
        console.error("Error finding manager:", error);
      }
    }

    // If still no manager found, find any admin
    if (!manager) {
      console.log("No manager found, looking for admin");
      try {
        manager = await db("users")
          .where({
            role: "admin",
            active: true,
          })
          .first();
        console.log("Found admin as manager:", manager);
      } catch (error) {
        console.error("Error finding admin:", error);
      }
    }

    // Generate a unique ID for the leave request
    const leaveRequestId = "LVE-" + Math.random().toString(36).substring(2, 10).toUpperCase()
    console.log("Generated leave request ID:", leaveRequestId);

    // Create leave request
    console.log("Creating leave request");
    let leaveRequest;
    try {
      [leaveRequest] = await db("leave_requests")
        .insert({
          id: leaveRequestId,
          user_id: userId,
          type,
          start_date: start,
          end_date: end,
          reason,
          status: "pending",
        })
        .returning("*")
      console.log("Created leave request:", leaveRequest);
    } catch (error) {
      console.error("Error creating leave request:", error);
      throw error;
    }

    // Initialize the multi-level approval workflow
    try {
      console.log("Initializing approval workflow");
      await leaveApprovalService.initializeWorkflow(leaveRequestId, userId)
      console.log("Approval workflow initialized");
    } catch (error) {
      console.error("Error initializing approval workflow:", error)
      // Don't throw here, as we still want to return the created request
    }

    res.status(201).json({
      success: true,
      data: leaveRequest,
      manager: manager
        ? {
            id: manager.id,
            name: manager.name,
            email: manager.email,
          }
        : null,
    })
  } catch (error) {
    console.error("Error in createLeaveRequest:", error);
    throw error;
  }
})

// @desc    Get all leave requests for a user
// @route   GET /api/leave
// @access  Private
exports.getLeaveRequests = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const isAdmin = req.user.role === "admin"
  const isManager = req.user.role === "manager"
  const { status, startDate, endDate, userId: queryUserId } = req.query

  let query = db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .leftJoin("users as a", "lr.approved_by", "a.id")
    .select(
      "lr.*",
      "u.name as user_name",
      "u.email as user_email",
      "u.department as user_department",
      "a.name as approved_by_name",
    )

  // If admin, can see all requests or filter by user
  if (isAdmin) {
    if (queryUserId) {
      query = query.where("lr.user_id", queryUserId)
    }
  }
  // If manager, can see requests from their department
  else if (isManager) {
    // Get manager's department
    const manager = await db("users").where({ id: userId }).first()
    if (manager && manager.department) {
      query = query.where("u.department", manager.department)
    } else {
      // If manager has no department, only show their own requests
      query = query.where("lr.user_id", userId)
    }
  }
  // Regular employees can only see their own requests
  else {
    query = query.where("lr.user_id", userId)
  }

  // Apply filters
  if (status) {
    query = query.where("lr.status", status)
  }

  if (startDate) {
    query = query.where("lr.start_date", ">=", startDate)
  }

  if (endDate) {
    query = query.where("lr.end_date", "<=", endDate)
  }

  // Order by creation date
  query = query.orderBy("lr.created_at", "desc")

  const leaveRequests = await query

  res.status(200).json({
    success: true,
    count: leaveRequests.length,
    data: leaveRequests,
  })
})

// @desc    Get leave requests pending approval for manager
// @route   GET /api/leave/pending-approval
// @access  Private/Manager
exports.getPendingApprovals = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const isAdmin = req.user.role === "admin"
  const isManager = req.user.role === "manager"

  // Only managers and admins can access this endpoint
  if (!isAdmin && !isManager) {
    res.status(403)
    throw new Error("Not authorized to access pending approvals")
  }

  try {
    // Get pending approvals for this user from the approval workflow
    const pendingApprovals = await leaveApprovalService.getPendingApprovalsForUser(userId)

    res.status(200).json({
      success: true,
      count: pendingApprovals.length,
      data: pendingApprovals,
    })
  } catch (error) {
    console.error("Error getting pending approvals:", error)
    res.status(500)
    throw new Error("Failed to get pending approvals")
  }
})

// @desc    Get leave request by ID
// @route   GET /api/leave/:id
// @access  Private
exports.getLeaveRequestById = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.user.id
  const isAdmin = req.user.role === "admin"
  const isManager = req.user.role === "manager"

  // Get leave request with user details
  const leaveRequest = await db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .leftJoin("users as a", "lr.approved_by", "a.id")
    .select(
      "lr.*",
      "u.name as user_name",
      "u.email as user_email",
      "u.department as user_department",
      "a.name as approved_by_name",
    )
    .where("lr.id", id)
    .first()

  if (!leaveRequest) {
    res.status(404)
    throw new Error("Leave request not found")
  }

  // Check if user has access to this leave request
  if (!isAdmin && leaveRequest.user_id !== userId) {
    // If manager, check if request is from their department
    if (isManager) {
      const manager = await db("users").where({ id: userId }).first()
      if (!manager || manager.department !== leaveRequest.user_department) {
        res.status(403)
        throw new Error("Not authorized to access this leave request")
      }
    } else {
      res.status(403)
      throw new Error("Not authorized to access this leave request")
    }
  }

  res.status(200).json({
    success: true,
    data: leaveRequest,
  })
})

// @desc    Update leave request status (approve/reject)
// @route   PUT /api/leave/:id
// @access  Private/Admin/Manager
exports.updateLeaveRequestStatus = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { status, approvalNotes } = req.body
  const userId = req.user.id
  const isAdmin = req.user.role === "admin"
  const isManager = req.user.role === "manager"

  // Check if user is admin or manager
  if (!isAdmin && !isManager) {
    res.status(403)
    throw new Error("Not authorized to approve/reject leave requests")
  }

  // Check if leave request exists
  const leaveRequest = await db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .select("lr.*", "u.name as user_name", "u.email as user_email", "u.department as user_department")
    .where("lr.id", id)
    .first()

  if (!leaveRequest) {
    res.status(404)
    throw new Error("Leave request not found")
  }

  // If manager, check if request is from their department
  if (isManager && !isAdmin) {
    const manager = await db("users").where({ id: userId }).first()
    if (!manager || manager.department !== leaveRequest.user_department) {
      res.status(403)
      throw new Error("Not authorized to approve/reject this leave request")
    }
  }

  // Get the current approval level for this leave request
  let leaveRequestDetails = null
  try {
    leaveRequestDetails = await db("leave_requests")
      .where({ id })
      .select("current_approval_level")
      .first()
  } catch (error) {
    console.error("Error getting current approval level:", error)
    // If the column doesn't exist, handle it gracefully
    leaveRequestDetails = { current_approval_level: null }
  }

  // If the request is not in the multi-level approval workflow yet, handle it the old way
  if (!leaveRequestDetails.current_approval_level) {
    // Legacy approval process
    const [updatedLeaveRequest] = await db("leave_requests")
      .where({ id })
      .update({
        status,
        approved_by: userId,
        approval_notes: approvalNotes,
        updated_at: db.fn.now(),
      })
      .returning("*")

    // If the request is approved, update the leave balance
    if (status === "approved") {
      await leaveApprovalService.updateLeaveBalance(id)
    }

    // Get employee details
    const employee = await db("users").where({ id: leaveRequest.user_id }).first()
    const approver = await db("users").where({ id: userId }).first()

    // Send notification to employee
    if (employee && approver) {
      try {
        await emailUtils.sendLeaveStatusUpdate(updatedLeaveRequest, employee, status, approver, 1)
      } catch (error) {
        console.error("Failed to send leave status update:", error)
      }
    }

    return res.status(200).json({
      success: true,
      data: updatedLeaveRequest,
    })
  }

  // Use the multi-level approval workflow
  try {
    // Process the approval or rejection
    const updatedLeaveRequest = await leaveApprovalService.processApproval(
      id,
      leaveRequestDetails.current_approval_level,
      userId,
      status,
      approvalNotes
    )

    // Get the approval workflow for this leave request
    const approvalWorkflow = await leaveApprovalService.getApprovalWorkflow(id)

    res.status(200).json({
      success: true,
      data: updatedLeaveRequest,
      approvalWorkflow,
    })
  } catch (error) {
    console.error("Error processing approval:", error)
    res.status(400)
    throw new Error(error.message)
  }
})

// @desc    Cancel leave request
// @route   PUT /api/leave/:id/cancel
// @access  Private
exports.cancelLeaveRequest = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.user.id
  const isAdmin = req.user.role === "admin"

  // Check if leave request exists
  const leaveRequest = await db("leave_requests").where({ id }).first()

  if (!leaveRequest) {
    res.status(404)
    throw new Error("Leave request not found")
  }

  // Check if user owns this leave request or is admin
  if (!isAdmin && leaveRequest.user_id !== userId) {
    res.status(403)
    throw new Error("Not authorized to cancel this leave request")
  }

  // Check if leave request can be cancelled
  if (leaveRequest.status !== "pending" && leaveRequest.status !== "approved") {
    res.status(400)
    throw new Error(`Cannot cancel a leave request that is already ${leaveRequest.status}`)
  }

  // If the request was approved, we need to update the leave balance
  if (leaveRequest.status === "approved") {
    // Calculate the number of days
    const startDate = new Date(leaveRequest.start_date)
    const endDate = new Date(leaveRequest.end_date)
    const diffTime = Math.abs(endDate - startDate)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1 // +1 to include both start and end dates

    // Get the current year
    const currentYear = new Date().getFullYear()

    // Get leave balance record
    const leaveBalance = await db("leave_balance")
      .where({
        user_id: leaveRequest.user_id,
        year: currentYear
      })
      .first()

    if (leaveBalance) {
      // Update the appropriate leave balance fields based on leave type
      const updateData = {}

      // Update used days and remaining days for all leave types
      updateData.used_days = Math.max(0, leaveBalance.used_days - diffDays)
      updateData.remaining_days = leaveBalance.total_allowance - updateData.used_days

      // Update specific leave type counters
      if (leaveRequest.type === "sick") {
        updateData.sick_used = Math.max(0, leaveBalance.sick_used - diffDays)
      } else if (leaveRequest.type === "personal") {
        updateData.personal_used = Math.max(0, leaveBalance.personal_used - diffDays)
      }

      // Update the leave balance
      await db("leave_balance")
        .where({ id: leaveBalance.id })
        .update(updateData)
    }
  }

  // Update leave request
  const [updatedLeaveRequest] = await db("leave_requests")
    .where({ id })
    .update({
      status: "cancelled",
      updated_at: db.fn.now(),
    })
    .returning("*")

  res.status(200).json({
    success: true,
    data: updatedLeaveRequest,
  })
})

// @desc    Get approval workflow for a leave request
// @route   GET /api/leave/:id/workflow
// @access  Private
exports.getLeaveApprovalWorkflow = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.user.id
  const isAdmin = req.user.role === "admin"
  const isManager = req.user.role === "manager"

  // Get leave request
  const leaveRequest = await db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .select("lr.*", "u.name as user_name", "u.email as user_email", "u.department as user_department")
    .where("lr.id", id)
    .first()

  if (!leaveRequest) {
    res.status(404)
    throw new Error("Leave request not found")
  }

  // Check if user has access to this leave request
  if (!isAdmin && leaveRequest.user_id !== userId) {
    // If manager, check if request is from their department
    if (isManager) {
      const manager = await db("users").where({ id: userId }).first()
      if (!manager || manager.department !== leaveRequest.user_department) {
        res.status(403)
        throw new Error("Not authorized to access this leave request")
      }
    } else {
      res.status(403)
      throw new Error("Not authorized to access this leave request")
    }
  }

  try {
    // Get the approval workflow
    const approvalWorkflow = await leaveApprovalService.getApprovalWorkflow(id)

    res.status(200).json({
      success: true,
      data: {
        leaveRequest,
        approvalWorkflow,
      },
    })
  } catch (error) {
    console.error("Error getting approval workflow:", error)
    res.status(500)
    throw new Error("Failed to get approval workflow")
  }
})

// @desc    Get leave statistics
// @route   GET /api/leave/stats
// @access  Private/Admin
exports.getLeaveStatistics = asyncHandler(async (req, res) => {
  const { year, department } = req.query
  const currentYear = new Date().getFullYear()
  const targetYear = year ? Number.parseInt(year) : currentYear

  // Only admins can access this endpoint
  if (req.user.role !== "admin") {
    res.status(403)
    throw new Error("Not authorized to access leave statistics")
  }

  // Build base query
  let query = db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .whereRaw(`EXTRACT(YEAR FROM lr.start_date) = ?`, [targetYear])
    .orWhereRaw(`EXTRACT(YEAR FROM lr.end_date) = ?`, [targetYear])

  // Apply department filter if provided
  if (department) {
    query = query.where("u.department", department)
  }

  const leaveRequests = await query

  // Calculate statistics
  const stats = {
    total: leaveRequests.length,
    byStatus: {
      pending: leaveRequests.filter((r) => r.status === "pending").length,
      approved: leaveRequests.filter((r) => r.status === "approved").length,
      rejected: leaveRequests.filter((r) => r.status === "rejected").length,
      cancelled: leaveRequests.filter((r) => r.status === "cancelled").length,
    },
    byType: {
      sick: leaveRequests.filter((r) => r.type === "sick").length,
      vacation: leaveRequests.filter((r) => r.type === "vacation").length,
      personal: leaveRequests.filter((r) => r.type === "personal").length,
      other: leaveRequests.filter((r) => r.type === "other").length,
    },
    byMonth: {},
    byDepartment: {},
  }

  // Group by month
  for (let month = 1; month <= 12; month++) {
    stats.byMonth[month] = leaveRequests.filter((r) => {
      const startDate = new Date(r.start_date)
      const endDate = new Date(r.end_date)
      return (
        (startDate.getFullYear() === targetYear && startDate.getMonth() + 1 === month) ||
        (endDate.getFullYear() === targetYear && endDate.getMonth() + 1 === month) ||
        (startDate.getFullYear() === targetYear &&
          endDate.getFullYear() === targetYear &&
          startDate.getMonth() + 1 <= month &&
          endDate.getMonth() + 1 >= month)
      )
    }).length
  }

  // Group by department
  const departments = await db("users").select("department").whereNotNull("department").groupBy("department")

  departments.forEach((dept) => {
    stats.byDepartment[dept.department] = leaveRequests.filter((r) => r.user_department === dept.department).length
  })

  res.status(200).json({
    success: true,
    year: targetYear,
    stats,
  })
})

// @desc    Get leave balance for current user
// @route   GET /api/leave/balance
// @access  Private
exports.getLeaveBalance = asyncHandler(async (req, res) => {
  const userId = req.user.id

  // Get user details
  const user = await db("users").where({ id: userId }).first()
  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Get current year
  const currentYear = new Date().getFullYear()

  // Get leave balance from the database
  let leaveBalance = await db("leave_balance")
    .where({
      user_id: userId,
      year: currentYear
    })
    .first()

  // If no leave balance record exists, create one
  if (!leaveBalance) {
    // Generate a unique ID for the leave balance
    const newLeaveBalanceId = `LB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`

    try {
      // Create default leave balance
      [leaveBalance] = await db("leave_balance")
        .insert({
          id: newLeaveBalanceId,
          user_id: userId,
          year: currentYear,
          annual_leave: 20,
          sick_leave: 10,
          other_leave: 5
        })
        .returning("*")
    } catch (error) {
      console.error("Error creating leave balance:", error)
      res.status(500)
      throw new Error("Failed to create leave balance record")
    }
  }

  // Get approved leave requests for the current year
  const leaveRequests = await db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .select(
      "lr.*",
      "u.name as user_name"
    )
    .where({
      "lr.user_id": userId,
      "lr.status": "approved"
    })
    .andWhere(function() {
      this.whereRaw(`EXTRACT(YEAR FROM lr.start_date) = ?`, [currentYear])
        .orWhereRaw(`EXTRACT(YEAR FROM lr.end_date) = ?`, [currentYear])
    })

  res.status(200).json({
    success: true,
    data: {
      year: currentYear,
      annual: {
        allowance: 20,
        used: 20 - leaveBalance.annual_leave,
        remaining: leaveBalance.annual_leave
      },
      sick: {
        allowance: 10,
        used: 10 - leaveBalance.sick_leave,
        remaining: leaveBalance.sick_leave
      },
      other: {
        allowance: 5,
        used: 5 - leaveBalance.other_leave,
        remaining: leaveBalance.other_leave
      },
      leaveRequests
    }
  })
})

// @desc    Get pending leave requests for approval
// @route   GET /api/leave/pending-approval
// @access  Private/Manager/Admin
exports.getPendingApprovals = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const isAdmin = req.user.role === "admin"
  const isManager = req.user.role === "manager"

  // Check if user is admin or manager
  if (!isAdmin && !isManager) {
    res.status(403)
    throw new Error("Not authorized to access pending approvals")
  }

  // Get user's department
  const user = await db("users").where({ id: userId }).first()
  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Build query based on user role
  let query = db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .select(
      "lr.*",
      "u.name as user_name",
      "u.email as user_email",
      "u.department as user_department"
    )
    .whereIn("lr.status", ["pending", "in_progress"])

  // If manager, only show requests from their department
  if (isManager && !isAdmin) {
    query = query.where("u.department", user.department)
  }

  // Get pending leave requests
  const pendingRequests = await query.orderBy("lr.created_at", "desc")

  res.status(200).json({
    success: true,
    count: pendingRequests.length,
    data: pendingRequests
  })
})

// @desc    Get department leave overview (for managers)
// @route   GET /api/leave/department-overview
// @access  Private/Manager/Admin
exports.getDepartmentOverview = asyncHandler(async (req, res) => {
  const userId = req.user.id
  const isAdmin = req.user.role === "admin"
  const isManager = req.user.role === "manager"

  // Check if user is admin or manager
  if (!isAdmin && !isManager) {
    res.status(403)
    throw new Error("Not authorized to access department overview")
  }

  // Get user's department
  const user = await db("users").where({ id: userId }).first()
  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Get department members
  let departmentMembers
  if (isAdmin && req.query.department) {
    // Admin can view any department
    departmentMembers = await db("users").where({ department: req.query.department })
  } else {
    // Manager can only view their department
    departmentMembers = await db("users").where({ department: user.department })
  }

  // Get leave requests for all department members
  const memberIds = departmentMembers.map(member => member.id)

  // Get current month and year
  const currentDate = new Date()
  const currentMonth = currentDate.getMonth() + 1 // JavaScript months are 0-indexed
  const currentYear = currentDate.getFullYear()

  // Get start and end of current month
  const startOfMonth = new Date(currentYear, currentMonth - 1, 1)
  const endOfMonth = new Date(currentYear, currentMonth, 0)

  // Get leave requests for the current month
  const leaveRequests = await db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .select(
      "lr.*",
      "u.name as user_name",
      "u.email as user_email",
      "u.department as user_department"
    )
    .whereIn("lr.user_id", memberIds)
    .andWhere(function() {
      this.where(function() {
        this.whereRaw(`EXTRACT(MONTH FROM lr.start_date) = ? AND EXTRACT(YEAR FROM lr.start_date) = ?`, [currentMonth, currentYear])
      })
      .orWhere(function() {
        this.whereRaw(`EXTRACT(MONTH FROM lr.end_date) = ? AND EXTRACT(YEAR FROM lr.end_date) = ?`, [currentMonth, currentYear])
      })
      .orWhere(function() {
        this.where("lr.start_date", "<=", endOfMonth)
          .andWhere("lr.end_date", ">=", startOfMonth)
      })
    })

  res.status(200).json({
    success: true,
    data: {
      department: user.department,
      month: currentMonth,
      year: currentYear,
      members: departmentMembers.map(member => ({
        id: member.id,
        name: member.name,
        position: member.position,
        leaveRequests: leaveRequests.filter(lr => lr.user_id === member.id)
      }))
    }
  })
})

// @desc    Get all leave balances (admin only)
// @route   GET /api/leave/balances
// @access  Private/Admin
exports.getAllLeaveBalances = asyncHandler(async (req, res) => {
  // Check if user is admin
  if (req.user.role !== "admin") {
    res.status(403)
    throw new Error("Not authorized to access leave balances")
  }

  // Get current year
  const currentYear = new Date().getFullYear()

  // Get all leave balances with user information
  const leaveBalances = await db("leave_balance as lb")
    .join("users as u", "lb.user_id", "u.id")
    .select(
      "lb.*",
      "u.name as user_name",
      "u.email as user_email",
      "u.department as user_department"
    )
    .where("lb.year", currentYear)
    .orderBy("u.name")

  res.status(200).json({
    success: true,
    data: leaveBalances
  })
})

// @desc    Adjust leave balance (admin only)
// @route   POST /api/leave/adjust-balance
// @access  Private/Admin
exports.adjustLeaveBalance = asyncHandler(async (req, res) => {
  const { userId, leaveType, adjustment } = req.body

  // Validate input
  if (!userId || !leaveType || adjustment === undefined) {
    res.status(400)
    throw new Error("Please provide userId, leaveType, and adjustment")
  }

  // Check if user is admin
  if (req.user.role !== "admin") {
    res.status(403)
    throw new Error("Not authorized to adjust leave balances")
  }

  // Get current year
  const currentYear = new Date().getFullYear()

  // Get user's leave balance
  let leaveBalance = await db("leave_balance")
    .where({
      user_id: userId,
      year: currentYear
    })
    .first()

  // If no leave balance exists, create one with the adjustment
  if (!leaveBalance) {
    const newLeaveBalanceId = `LB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
    
    const initialBalance = {
      id: newLeaveBalanceId,
      user_id: userId,
      year: currentYear,
      annual_leave: leaveType === "annual" ? adjustment : 20,
      sick_leave: leaveType === "sick" ? adjustment : 10,
      other_leave: leaveType === "other" ? adjustment : 5
    }

    [leaveBalance] = await db("leave_balance")
      .insert(initialBalance)
      .returning("*")
  } else {
    // Update existing balance
    const updateData = {}

    if (leaveType === "annual") {
      updateData.annual_leave = Math.max(0, leaveBalance.annual_leave + adjustment)
    } else if (leaveType === "sick") {
      updateData.sick_leave = Math.max(0, leaveBalance.sick_leave + adjustment)
    } else if (leaveType === "other") {
      updateData.other_leave = Math.max(0, leaveBalance.other_leave + adjustment)
    }

    updateData.updated_at = db.fn.now()

    // Update the leave balance
    ;[leaveBalance] = await db("leave_balance")
      .where({ id: leaveBalance.id })
      .update(updateData)
      .returning("*")
  }

  // Get user details
  const user = await db("users").where({ id: userId }).first()

  // Add audit log
  await db("leave_balance_audit").insert({
    id: `LBA-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    leave_balance_id: leaveBalance.id,
    adjusted_by: req.user.id,
    adjustment_type: leaveType,
    adjustment_amount: adjustment,
    previous_value: leaveType === "annual" 
      ? leaveBalance.annual_leave - adjustment
      : leaveType === "sick"
        ? leaveBalance.sick_leave - adjustment
        : leaveBalance.other_leave - adjustment,
    new_value: leaveType === "annual"
      ? leaveBalance.annual_leave
      : leaveType === "sick"
        ? leaveBalance.sick_leave
        : leaveBalance.other_leave,
    notes: `Leave balance adjusted by ${req.user.name} (${req.user.email})`
  })

  res.status(200).json({
    success: true,
    data: {
      ...leaveBalance,
      user_name: user.name,
      user_email: user.email,
      user_department: user.department
    }
  })
})
