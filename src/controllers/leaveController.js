const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const LeaveApprovalService = require("../services/leaveApprovalService")
const employeeLeaveBalanceService = require("../services/employeeLeaveBalanceService")

const leaveApprovalService = new LeaveApprovalService()

/**
 * @desc    Create a new leave request and initialize approval workflow
 * @route   POST /api/leave
 * @access  Private
 */
exports.createLeaveRequest = asyncHandler(async (req, res) => {
  const { type, startDate, endDate, reason } = req.body
  const userId = req.user.id

  // Basic validation
  if (!type || !startDate || !endDate || !reason) {
    res.status(400).json({ message: "Please provide all required fields." })
    return
  }
  
  // More robust date validation
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      res.status(400).json({ message: "Invalid start or end date." });
      return;
  }

  // Use the service to create the request and initialize the workflow
  const { leaveRequest, workflow } = await leaveApprovalService.createLeaveRequestAndInitializeWorkflow({
    user_id: userId,
    type,
    start_date: start,
    end_date: end,
    reason,
  })

  res.status(201).json({
    success: true,
    message: "Leave request submitted successfully and workflow initiated.",
    data: leaveRequest,
    workflow,
  })
})

/**
 * @desc    Get all leave requests based on user role and permissions
 * @route   GET /api/leave
 * @access  Private
 */
exports.getAllLeaveRequests = asyncHandler(async (req, res) => {
  const { status, startDate, endDate, userId: queryUserId } = req.query
  const actingUserId = req.user.id
  
  const canReadAll = req.hasPermission("read:leave_request:all")
  
  let targetUserId = canReadAll && queryUserId ? queryUserId : actingUserId
  
  // If not admin and no specific user is requested, it's for the acting user
  if (!canReadAll) {
    targetUserId = actingUserId
  }

  // Build a query using Knex...
  let query = db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .leftJoin("users as a", "lr.approved_by", "a.id")
    .select(
      "lr.id", "u.name as user_name", "u.department", "lr.type", 
      "lr.start_date", "lr.end_date", "lr.reason", "lr.status",
      "a.name as approver_name", "lr.created_at"
    )

  if (!canReadAll) {
    query = query.where("lr.user_id", actingUserId)
  } else if (queryUserId) {
    query = query.where("lr.user_id", queryUserId)
  }

  // Add filters
  if (status) query.where("lr.status", status);
  if (startDate) query.where("lr.start_date", ">=", startDate);
  if (endDate) query.where("lr.end_date", "<=", endDate);

  const leaveRequests = await query.orderBy("lr.created_at", "desc");
  
  res.status(200).json({
    success: true,
    count: leaveRequests.length,
    data: leaveRequests,
  })
})


/**
 * @desc    Get a single leave request by ID, with workflow details
 * @route   GET /api/leave/:id
 * @access  Private
 */
exports.getLeaveRequestById = asyncHandler(async (req, res) => {
  const { id } = req.params
  const leaveRequest = await leaveApprovalService.getLeaveRequestWithWorkflow(id)

  if (!leaveRequest) {
    res.status(404)
    throw new Error("Leave request not found")
  }

  // Service-level or RBAC middleware should handle authorization
  // For now, basic check:
  if (req.user.id !== leaveRequest.user_id && !req.hasPermission("read:leave_request:all")) {
     res.status(403)
     throw new Error("You are not authorized to view this leave request.")
  }

  res.status(200).json({ success: true, data: leaveRequest })
})

/**
 * @desc    Approve or reject a leave request
 * @route   PUT /api/leave/:id/decide
 * @access  Private (Manager/HR/Admin)
 */
exports.decideLeaveRequest = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { decision, comments } = req.body // decision: "approved" or "rejected"
  const actingUserId = req.user.id

  if (!["approved", "rejected"].includes(decision)) {
    res.status(400)
    throw new Error("Invalid decision. Must be 'approved' or 'rejected'.")
  }

  // Get the leave request to determine the current approval level
  const leaveRequest = await db("leave_requests").where({ id }).first()
  if (!leaveRequest) {
    res.status(404)
    throw new Error("Leave request not found")
  }

  const result = await leaveApprovalService.processApproval(
    id, 
    leaveRequest.current_approval_level || 1, 
    actingUserId, 
    decision, 
    comments
  )

  res.status(200).json({
    success: true,
    message: `Leave request has been ${decision}.`,
    data: result,
  })
})

/**
 * @desc    Update a leave request (generic update, for admin changes)
 * @route   PUT /api/leave/:id
 * @access  Private (Admin)
 */
exports.updateLeaveRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, comments } = req.body;
    const approverId = req.user.id;

    // This remains a simple update for admin overrides, bypassing complex workflow logic
    const [updatedRequest] = await db("leave_requests")
        .where({ id })
        .update({
            status,
            approval_notes: comments,
            approved_by: approverId,
            updated_at: db.fn.now()
        })
        .returning("*");
    
    // Note: This does not trigger balance updates or notifications.
    // Use the decideLeaveRequest endpoint for standard approvals.
    
    res.status(200).json({ success: true, data: updatedRequest });
});

/**
 * @desc    Cancel a leave request
 * @route   PUT /api/leave/:id/cancel
 * @access  Private
 */
exports.cancelLeaveRequest = asyncHandler(async (req, res) => {
  const { id } = req.params
  const actingUserId = req.user.id

  const updatedRequest = await leaveApprovalService.cancelLeaveRequest(id, actingUserId)

  res.status(200).json({
    success: true,
    message: "Leave request cancelled successfully.",
    data: updatedRequest,
  })
})

/**
 * @desc    Get leave balance for the current user
 * @route   GET /api/leave/balance
 * @access  Private
 */
exports.getLeaveBalance = asyncHandler(async (req, res) => {
  const balance = await employeeLeaveBalanceService.getEmployeeLeaveBalance(req.user.id)
  res.status(200).json({ success: true, data: balance })
})

/**
 * @desc    Get leave statistics
 * @route   GET /api/leave/stats
 * @access  Private (HR/Admin)
 */
exports.getLeaveStats = asyncHandler(async (req, res) => {
  const stats = await db("leave_requests")
    .select("status")
    .count("* as count")
    .groupBy("status")
  res.status(200).json({ success: true, data: stats })
})

/**
 * @desc    Get leave requests for a department
 * @route   GET /api/leave/department
 * @access  Private (Manager/HR/Admin)
 */
exports.getDepartmentLeave = asyncHandler(async (req, res) => {
  const userDepartment = req.user.department
  const leaveRequests = await db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .where("u.department", userDepartment)
    .select("lr.*", "u.name as user_name")
  res.status(200).json({ success: true, data: leaveRequests })
})

/**
 * @desc    Get leave requests pending the current user's approval
 * @route   GET /api/leave/pending-approvals
 * @access  Private (Manager/HR/Admin)
 */
exports.getPendingApprovals = asyncHandler(async (req, res) => {
  const pendingRequests = await leaveApprovalService.getPendingApprovalsForUser(req.user.id)
  res.status(200).json({ success: true, count: pendingRequests.length, data: pendingRequests })
})

/**
 * @desc    Bulk update status of leave requests
 * @route   POST /api/leave/bulk-update
 * @access  Private (Manager/HR/Admin)
 */
exports.bulkUpdateLeaveStatus = asyncHandler(async (req, res) => {
  const { requestIds, status, comments } = req.body
  const approverId = req.user.id

  // Note: This bypasses the approval workflow service for now.
  // For a full implementation, this should loop and call `processApproval` for each ID.
  const updated = await db("leave_requests")
    .whereIn("id", requestIds)
    .update({
      status,
      approval_notes: comments,
      approved_by: approverId,
      updated_at: db.fn.now(),
    })

  res.status(200).json({ success: true, message: `${updated} leave requests updated.` })
}) 