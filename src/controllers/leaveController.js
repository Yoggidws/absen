const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const { sendLeaveNotification } = require("../utils/notificationUtils")
const employeeLeaveBalanceService = require("../services/employeeLeaveBalanceService")

/**
 * @desc    Create a new leave request
 * @route   POST /api/leave
 * @access  Private
 */
exports.createLeaveRequest = asyncHandler(async (req, res) => {
  const { type, start_date, end_date, reason } = req.body
  const userId = req.user.id

  if (!type || !start_date || !end_date || !reason) {
    res.status(400)
    throw new Error("Please provide all required fields for the leave request.")
  }

  // More validation can be added here (e.g., date validation, balance check)

  const [leaveRequest] = await db("leave_requests")
    .insert({
      user_id: userId,
      type,
      start_date,
      end_date,
      reason,
      status: "pending",
    })
    .returning("*")

  res.status(201).json({ success: true, data: leaveRequest })
})

/**
 * @desc    Get all leave requests (or own requests)
 * @route   GET /api/leave
 * @access  Private
 */
exports.getAllLeaveRequests = asyncHandler(async (req, res) => {
  let query = db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .leftJoin("users as a", "lr.approved_by", "a.id")
    .select(
        "lr.id", "u.name as user_name", "u.department", "lr.type", 
        "lr.start_date", "lr.end_date", "lr.reason", "lr.status",
        "a.name as approver_name"
    )

  // Use the new rbac helpers if they exist, otherwise fallback to old structure
  // const hasPermission = req.hasPermission || ((p) => req.user?.permissions?.includes(p));

  if (!req.hasPermission("read:leave_request:all")) {
    query = query.where("lr.user_id", req.user.id)
  }

  const leaveRequests = await query.orderBy("lr.created_at", "desc")

  res.status(200).json({
    success: true,
    count: leaveRequests.length,
    data: leaveRequests,
  })
})

/**
 * @desc    Get a single leave request by ID
 * @route   GET /api/leave/:id
 * @access  Private
 */
exports.getLeaveRequestById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const leaveRequest = await db("leave_requests as lr")
    .join("users as u", "lr.user_id", "u.id")
    .leftJoin("users as a", "lr.approved_by", "a.id")
    .select(
        "lr.*", "u.name as user_name", "u.email as user_email", 
        "u.department", "a.name as approver_name"
    )
    .where("lr.id", id)
    .first();

  if (!leaveRequest) {
    res.status(404);
    throw new Error("Leave request not found");
  }

  if (leaveRequest.user_id !== req.user.id && !req.hasPermission("read:leave_request:all")) {
    res.status(403);
    throw new Error("Forbidden: You do not have permission to view this leave request.");
  }

  res.status(200).json({ success: true, data: leaveRequest });
});

/**
 * @desc    Update a leave request (status)
 * @route   PUT /api/leave/:id
 * @access  Private (Manager/HR/Admin)
 */
exports.updateLeaveRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, comments } = req.body;
    const approverId = req.user.id;

    const [updatedRequest] = await db("leave_requests")
        .where({ id })
        .update({
            status,
            approval_notes: comments,
            approved_by: approverId,
            updated_at: db.fn.now()
        })
        .returning("*");
    
    res.status(200).json({ success: true, data: updatedRequest });
});

/**
 * @desc    Cancel a leave request
 * @route   PUT /api/leave/:id/cancel
 * @access  Private
 */
exports.cancelLeaveRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const leaveRequest = await db("leave_requests").where({ id }).first();

  if (!leaveRequest) {
    res.status(404);
    throw new Error("Leave request not found");
  }

  if (leaveRequest.user_id !== userId) {
    res.status(403);
    throw new Error("Forbidden: You can only cancel your own leave requests.");
  }

  if (leaveRequest.status !== 'pending' && leaveRequest.status !== 'approved') {
    res.status(400);
    throw new Error(`Cannot cancel a leave request with status '${leaveRequest.status}'`);
  }

  const [updatedRequest] = await db("leave_requests")
    .where({ id })
    .update({ status: 'cancelled', updated_at: db.fn.now() })
    .returning("*");

  res.status(200).json({ success: true, data: updatedRequest });
});


/**
 * @desc    Get leave balance for the current user
 * @route   GET /api/leave/balance
 * @access  Private
 */
exports.getLeaveBalance = asyncHandler(async (req, res) => {
    const balance = await employeeLeaveBalanceService.getEmployeeLeaveBalance(req.user.id);
    res.status(200).json({ success: true, data: balance });
});


/**
 * @desc    Get leave statistics
 * @route   GET /api/leave/stats
 * @access  Private (HR/Admin)
 */
exports.getLeaveStats = asyncHandler(async (req, res) => {
    const stats = await db('leave_requests')
        .select('status')
        .count('* as count')
        .groupBy('status');
    res.status(200).json({ success: true, data: stats });
});


/**
 * @desc    Get leave requests for a department
 * @route   GET /api/leave/department
 * @access  Private (Manager/HR/Admin)
 */
exports.getDepartmentLeave = asyncHandler(async (req, res) => {
    const userDepartment = req.user.department;
    
    const leaveRequests = await db('leave_requests as lr')
        .join('users as u', 'lr.user_id', 'u.id')
        .where('u.department', userDepartment)
        .select('lr.*', 'u.name as user_name');

    res.status(200).json({ success: true, data: leaveRequests });
});


/**
 * @desc    Get leave requests pending approval for the current user
 * @route   GET /api/leave/pending-approvals
 * @access  Private (Manager/HR/Admin)
 */
exports.getPendingApprovals = asyncHandler(async (req, res) => {
    // This logic can be simple (based on department) or complex (multi-level workflow)
    // For now, managers see all pending requests from their department
    const userDepartment = req.user.department;

    const pendingRequests = await db('leave_requests as lr')
        .join('users as u', 'lr.user_id', 'u.id')
        .where('u.department', userDepartment)
        .andWhere('lr.status', 'pending')
        .select('lr.*', 'u.name as user_name');
    
    res.status(200).json({ success: true, data: pendingRequests });
});


/**
 * @desc    Bulk update status of leave requests
 * @route   POST /api/leave/bulk-update
 * @access  Private (Manager/HR/Admin)
 */
exports.bulkUpdateLeaveStatus = asyncHandler(async (req, res) => {
    const { requestIds, status, comments } = req.body;
    const approverId = req.user.id;

    const updated = await db('leave_requests')
        .whereIn('id', requestIds)
        .update({
            status,
            approval_notes: comments,
            approved_by: approverId,
            updated_at: db.fn.now()
        });
    
    res.status(200).json({ success: true, message: `${updated} leave requests updated.`});
});
