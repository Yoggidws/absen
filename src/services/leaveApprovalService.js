const { db } = require("../config/db")
const emailUtils = require("../utils/emailUtils")
const employeeLeaveBalanceService = require("./employeeLeaveBalanceService")
const { v4: uuidv4 } = require("uuid")

// Helper function to generate IDs that fit within 36 characters
const generateLeaveId = (prefix = "LV") => {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, "0")
  const day = now.getDate().toString().padStart(2, "0")
  const timestamp = Date.now().toString().slice(-6) // Last 6 digits of timestamp
  return `${prefix}${year}${month}${day}${timestamp}`
}

/**
 * Service to handle the multi-level approval workflow for leave requests
 */
class LeaveApprovalService {
  /**
   * Initialize the approval workflow for a new leave request
   * @param {string} leaveRequestId - The ID of the leave request
   * @param {string} requesterId - The ID of the user who created the request
   * @returns {Promise<Array>} - The created approval workflow steps
   */
  async initializeWorkflow(leaveRequestId, requesterId, trx = null) {
    try {
      const operation = async (transaction) => {
        console.log(`Initializing workflow for request ${leaveRequestId} by user ${requesterId}`)
        const requester = await this._getUserDetails(requesterId, transaction)
        let approvalLevel = 1
        let leaveRequestStatusUpdate = { status: "pending", current_approval_level: approvalLevel }

        if (requester.is_owner || (requester.role === 'admin' && await this._isUserTheOnlyOwnerOrAdmin(requesterId, transaction))) {
          console.log(`Requester ${requesterId} is owner/sole admin. Auto-approving.`)
          leaveRequestStatusUpdate = { status: "approved", approved_by: requester.id, current_approval_level: approvalLevel }
          
          // Create auto-approval workflow entry
          await transaction("leave_approval_workflow").insert({
            id: generateLeaveId("LAW"),
            leave_request_id: leaveRequestId,
            approval_level: approvalLevel,
            approver_id: requester.id,
            approver_role: "owner_auto_approved",
            status: "approved",
            comments: "Auto-approved as owner/sole admin.",
            approved_at: new Date(),
          })
          
          // Update leave request status first
          await transaction("leave_requests")
            .where({ id: leaveRequestId })
            .update(leaveRequestStatusUpdate)
          
          // Then update balance and notify
          await this.updateLeaveBalance(leaveRequestId, transaction, requester.id)
          await this.notifyEmployee(leaveRequestId, 'approved', requester.id, approvalLevel, transaction)
        } else {
          // Regular approval workflow
          const departmentManager = await this._findDepartmentManager(requester.department, transaction)
          if (departmentManager && departmentManager.id !== requesterId) {
            // Department manager approval
            await transaction("leave_approval_workflow").insert({
              id: generateLeaveId("LAW"),
              leave_request_id: leaveRequestId,
              approval_level: approvalLevel,
              approver_id: departmentManager.id,
              approver_role: "department_manager",
              status: "pending",
              comments: null,
            })
          } else {
            // Skip to HR manager level
            approvalLevel = 2
            leaveRequestStatusUpdate.current_approval_level = approvalLevel
            const hrManager = await this._findHRManager(transaction)
            if (hrManager) {
              await transaction("leave_approval_workflow").insert({
                id: generateLeaveId("LAW"),
                leave_request_id: leaveRequestId,
                approval_level: approvalLevel,
                approver_id: hrManager.id,
                approver_role: "hr_manager",
                status: "pending",
                comments: null,
              })
            } else {
              // Skip to owner level
              approvalLevel = 3
              leaveRequestStatusUpdate.current_approval_level = approvalLevel
              const owner = await this._findOwner(transaction)
              if (owner) {
                await transaction("leave_approval_workflow").insert({
                  id: generateLeaveId("LAW"),
                  leave_request_id: leaveRequestId,
                  approval_level: approvalLevel,
                  approver_id: owner.id,
                  approver_role: "owner",
                  status: "pending",
                  comments: null,
                })
              } else {
                leaveRequestStatusUpdate = {
                  status: "error_no_approver",
                  current_approval_level: 0,
                  approval_notes: "No suitable approver found in the system."
                }
              }
            }
          }
          
          // Update leave request status for non-auto-approved requests
          await transaction("leave_requests")
            .where({ id: leaveRequestId })
            .update(leaveRequestStatusUpdate)
        }

        return leaveRequestStatusUpdate
      }

      if (trx) {
        return await operation(trx)
      } else {
        return await db.transaction(operation)
      }
    } catch (error) {
      console.error(`Error initializing workflow for leave request ${leaveRequestId}:`, error)
      
      const errorUpdate = {
        status: "error_workflow_init",
        current_approval_level: 0,
        approval_notes: `Workflow initialization failed: ${error.message}`
      }

      if (trx) {
        await trx("leave_requests").where({ id: leaveRequestId }).update(errorUpdate)
      } else {
        await db("leave_requests").where({ id: leaveRequestId }).update(errorUpdate)
      }

      throw new Error(`Failed to initialize approval workflow: ${error.message}`)
    }
  }

  /**
   * Process an approval or rejection at a specific level
   * @param {string} leaveRequestId - The ID of the leave request
   * @param {number} approvalLevel - The approval level (1, 2, or 3)
   * @param {string} actingUserId - The ID of the user acting as the approver
   * @param {string} decision - The decision ("approved" or "rejected")
   * @param {string} comments - Comments from the approver
   * @returns {Promise<Object>} - The updated leave request and approval workflow history
   */
  async processApproval(leaveRequestId, approvalLevel, actingUserId, decision, comments) {
    try {
      const operation = async (transaction) => {
        console.log(`Processing approval for ${leaveRequestId}, level ${approvalLevel} by ${actingUserId}, decision: ${decision}`)
        
        // Find the specific workflow entry for this user and level
        const workflowEntry = await transaction("leave_approval_workflow")
          .where({
            leave_request_id: leaveRequestId,
            approval_level: approvalLevel,
            approver_id: actingUserId,
            status: "pending",
          })
          .first()

        if (!workflowEntry) {
          throw new Error(
            `No pending approval found for request ${leaveRequestId} at level ${approvalLevel} for user ${actingUserId}, or user not authorized/already acted.`
          )
        }

        // Update the workflow entry
        await transaction("leave_approval_workflow")
          .where({ id: workflowEntry.id })
          .update({
            status: decision,
            comments: comments || null,
            approved_at: new Date(),
          })
        
        let finalStatus = decision
        let updateData = {
          approved_by: actingUserId,
          approval_notes: comments || workflowEntry.comments,
          updated_at: new Date(),
        }

        // If rejected, set final status
        if (decision === "rejected") {
          finalStatus = "rejected"
          updateData.status = finalStatus
        } else if (decision === "approved") {
          // Check if there are more approval levels needed
          const nextWorkflowEntry = await transaction("leave_approval_workflow")
            .where({
              leave_request_id: leaveRequestId,
              approval_level: approvalLevel + 1,
              status: "pending"
            })
            .first()

          if (nextWorkflowEntry) {
            // More approvals needed - keep status as pending but update current approval level
            finalStatus = "pending"
            updateData.status = finalStatus
            updateData.current_approval_level = approvalLevel + 1
          } else {
            // Final approval - set to approved
            finalStatus = "approved"
            updateData.status = finalStatus
          }
        }
        
        // Update the leave request
        await transaction("leave_requests")
          .where({ id: leaveRequestId })
          .update(updateData)
        
        console.log(`Leave request ${leaveRequestId} status updated to ${finalStatus} by ${actingUserId}`)

        // Update balance and notify only if finally approved
        if (finalStatus === "approved") {
          await this.updateLeaveBalance(leaveRequestId, transaction, actingUserId)
        }

        await this.notifyEmployee(leaveRequestId, finalStatus, actingUserId, approvalLevel, transaction)
        
        const updatedLeaveRequest = await transaction("leave_requests").where({id: leaveRequestId}).first()
        const approvalWorkflowHistory = await this.getApprovalWorkflow(leaveRequestId, transaction)

        return { updatedLeaveRequest, approvalWorkflow: approvalWorkflowHistory }
      }

      return await db.transaction(operation)
    } catch (error) {
      console.error("Error processing approval:", error)
      throw error
    }
  }

  /**
   * Update the leave balance after final approval
   * @param {string} leaveRequestId - The ID of the leave request
   */
  async updateLeaveBalance(leaveRequestId, trx = null, actingUserId = null) {
    const queryRunner = trx || db
    
    // Get the leave request - don't filter by status since it might not be updated yet in the transaction
    const leaveRequest = await queryRunner("leave_requests")
      .where({ id: leaveRequestId })
      .first()

    if (!leaveRequest) {
      console.log(`Leave request ${leaveRequestId} not found for balance update.`)
      return
    }

    // Check if the request is approved or being approved
    if (leaveRequest.status !== "approved") {
      console.log(`Leave request ${leaveRequestId} is not approved (status: ${leaveRequest.status}), skipping balance update.`)
      return
    }

    const startDate = new Date(leaveRequest.start_date)
    const endDate = new Date(leaveRequest.end_date)
    const diffTime = Math.abs(endDate - startDate)
    const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    const currentYear = startDate.getFullYear()

    try {
      // **INTEGRATION POINT**: Get current leave balance from Employee System
      let leaveBalance = await employeeLeaveBalanceService.getEmployeeLeaveBalance(leaveRequest.user_id, currentYear)
      
      const balanceFieldMap = {
        "annual": "annual_leave", "sick": "sick_leave", "long": "long_leave",
        "maternity": "maternity_leave", "paternity": "paternity_leave",
        "marriage": "marriage_leave", "death": "death_leave", "hajj_umrah": "hajj_umrah_leave"
      }

      const fieldToUpdate = balanceFieldMap[leaveRequest.type]
      if (!fieldToUpdate || typeof leaveBalance[fieldToUpdate] === 'undefined') {
        console.error(`Invalid leave type "${leaveRequest.type}" or balance field "${fieldToUpdate}" not configured for request ${leaveRequestId}.`)
        return
      }

      const currentBalance = leaveBalance[fieldToUpdate]
      const newBalanceValue = Math.max(0, currentBalance - requestedDays) // Ensure balance doesn't go negative

      // Update the balance
      await queryRunner("leave_balance")
        .where({ id: leaveBalance.id })
        .update({ 
          [fieldToUpdate]: newBalanceValue,
          updated_at: new Date()
        })

      // Create audit record
      await queryRunner("leave_balance_audit").insert({
        id: generateLeaveId("LBA"),
        leave_balance_id: leaveBalance.id,
        adjusted_by: actingUserId || leaveRequest.user_id,
        adjustment_type: `approved_${leaveRequest.type}`,
        adjustment_amount: -requestedDays,
        previous_value: currentBalance,
        new_value: newBalanceValue,
        notes: `Leave request ${leaveRequestId} approved. Type: ${leaveRequest.type}, Days: ${requestedDays}`,
      })
      
      console.log(`Leave balance updated for user ${leaveRequest.user_id} due to request ${leaveRequestId}. ${fieldToUpdate}: ${currentBalance} -> ${newBalanceValue}`)
    } catch (error) {
      console.error(`Failed to update leave balance for request ${leaveRequestId}:`, error)
      // Don't throw error to avoid breaking the approval flow
      console.log(`Balance update failed but approval will continue for request ${leaveRequestId}`)
    }
  }

  /**
   * Notify the employee about the status of their leave request
   * @param {string} leaveRequestId - The ID of the leave request
   * @param {string} finalStatus - The final status of the leave request
   * @param {string} actingUserId - The ID of the user acting as the approver
   * @param {number} approvalLevel - The approval level
   */
  async notifyEmployee(leaveRequestId, finalStatus, actingUserId, approvalLevel, trx = null) {
    const queryRunner = trx || db
    const leaveRequestDetails = await queryRunner("leave_requests as lr")
      .join("users as u_req", "lr.user_id", "u_req.id")
      .where("lr.id", leaveRequestId)
      .select("lr.*", "u_req.email as requester_email", "u_req.name as requester_name")
      .first()

    if (!leaveRequestDetails) {
      console.error(`Cannot send notification: Leave request ${leaveRequestId} not found.`)
      return
    }
    
    const actingUserDetails = await this._getUserDetails(actingUserId, queryRunner)

    try {
      await emailUtils.sendLeaveStatusUpdate(
        leaveRequestDetails,
        { id: leaveRequestDetails.user_id, name: leaveRequestDetails.requester_name, email: leaveRequestDetails.requester_email },
        finalStatus,
        actingUserDetails,
        approvalLevel
      )
      console.log(`Notification sent to ${leaveRequestDetails.requester_email} for leave request ${leaveRequestId} status: ${finalStatus}`)
    } catch (emailError) {
      console.error(`Failed to send leave status update email for ${leaveRequestId}:`, emailError)
    }
  }

  /**
   * Get the approval workflow for a leave request
   * @param {string} leaveRequestId - The ID of the leave request
   * @returns {Promise<Array>} - The approval workflow steps with approver details
   */
  async getApprovalWorkflow(leaveRequestId, trx = null) {
    const queryRunner = trx || db
    return queryRunner("leave_approval_workflow as law")
      .join("users as u_approver", "law.approver_id", "u_approver.id")
      .leftJoin("leave_requests as lr", "law.leave_request_id", "lr.id")
      .leftJoin("users as u_requester", "lr.user_id", "u_requester.id")
      .select(
        "law.*",
        "u_approver.name as approver_name",
        "u_approver.email as approver_email",
        "u_requester.name as requester_name"
      )
      .where("law.leave_request_id", leaveRequestId)
      .orderBy(["law.approval_level", "law.created_at"])
  }

  /**
   * Get pending approvals for a specific user
   * @param {string} userId - The ID of the user
   * @returns {Promise<Array>} - The pending approvals
   */
  async getPendingApprovalsForUser(userId, trx = null) {
    const queryRunner = trx || db
    return queryRunner("leave_approval_workflow as law")
      .join("leave_requests as lr", "law.leave_request_id", "lr.id")
      .join("users as u_requester", "lr.user_id", "u_requester.id")
      .where("law.approver_id", userId)
      .where("law.status", "pending")
      .where("lr.status", "pending")
      .select(
        "lr.id",
        "lr.user_id",
        "lr.type",
        "lr.start_date",
        "lr.end_date",
        "lr.reason",
        "lr.status",
        "lr.created_at",
        "lr.current_approval_level",
        "u_requester.name as user_name",
        "u_requester.email as user_email",
        "u_requester.department as user_department",
        "law.approval_level",
        "law.approver_role"
      )
      .orderBy("lr.created_at", "asc")
  }

  // Helper to get user details
  async _getUserDetails(userId, trx) {
    const query = trx ? db("users").transacting(trx) : db("users")
    const user = await query.where({ id: userId }).first()
    if (!user) throw new Error(`User not found: ${userId}`)
    return user
  }

  // Helper to find Department Manager
  async _findDepartmentManager(departmentName, trx) {
    if (!departmentName) return null
    const queryDb = trx || db

    const department = await queryDb("departments").where({ name: departmentName }).first()
    if (department && department.manager_id) {
      const designatedManager = await queryDb("users").where({ id: department.manager_id, active: true }).first()
      if (designatedManager) return designatedManager
    }

    const anyManagerInDept = await queryDb("users")
      .where({ department: departmentName, role: "manager", active: true })
      .first()
    if (anyManagerInDept) return anyManagerInDept
    
    return null
  }

  // Helper to find HR Manager
  async _findHRManager(trx) {
    const queryDb = trx || db
    const hrDeptManager = await queryDb("users")
      .where({ department: "HR", role: "manager", active: true })
      .first()
    if (hrDeptManager) return hrDeptManager
    
    // Fallback: Any admin if no specific HR manager in HR department
    const adminUser = await queryDb("users").where({ role: "admin", active: true }).orderBy('created_at', 'asc').first()
    return adminUser
  }

  // Helper to find Owner
  async _findOwner(trx) {
    const queryDb = trx || db
    let owner = await queryDb("users").where({ is_owner: true, active: true }).first()
    if (owner) return owner

    owner = await queryDb("users").where({ role: "admin", active: true }).orderBy('created_at', 'asc').first()
    return owner
  }
  
  async _isUserTheOnlyOwnerOrAdmin(userId, trx) {
    const ownerOrAdminCount = await (trx || db)("users")
      .whereIn("role", ["owner", "admin"])
      .andWhere("active", true)
      .count("id as count")
      .first()

    return parseInt(ownerOrAdminCount.count) === 1
  }

  /**
   * Create a new leave request and initialize the approval workflow
   * @param {Object} leaveData - The leave request data
   * @returns {Promise<Object>} - The created leave request and workflow
   */
  async createLeaveRequestAndInitializeWorkflow(leaveData) {
    return await db.transaction(async (trx) => {
      try {
        // Generate a unique ID for the leave request
        const leaveRequestId = generateLeaveId("LR")

        // Create the leave request
        const [leaveRequest] = await trx("leave_requests")
          .insert({
            id: leaveRequestId,
            user_id: leaveData.user_id,
            type: leaveData.type,
            start_date: leaveData.start_date,
            end_date: leaveData.end_date,
            reason: leaveData.reason,
            status: "pending",
            current_approval_level: 1,
          })
          .returning("*")

        // Initialize the approval workflow
        const workflow = await this.initializeWorkflow(leaveRequestId, leaveData.user_id, trx)

        return { leaveRequest, workflow }
      } catch (error) {
        console.error("Error creating leave request and workflow:", error)
        throw error
      }
    })
  }

  /**
   * Get a leave request with its approval workflow
   * @param {string} leaveRequestId - The ID of the leave request
   * @returns {Promise<Object>} - The leave request with workflow details
   */
  async getLeaveRequestWithWorkflow(leaveRequestId) {
    try {
      // Get the leave request details
      const leaveRequest = await db("leave_requests as lr")
        .join("users as u", "lr.user_id", "u.id")
        .leftJoin("users as a", "lr.approved_by", "a.id")
        .select(
          "lr.*",
          "u.name as user_name",
          "u.email as user_email",
          "u.department as user_department",
          "a.name as approved_by_name"
        )
        .where("lr.id", leaveRequestId)
        .first()

      if (!leaveRequest) {
        return null
      }

      // Get the approval workflow
      const workflow = await this.getApprovalWorkflow(leaveRequestId)

      return {
        ...leaveRequest,
        workflow
      }
    } catch (error) {
      console.error("Error getting leave request with workflow:", error)
      throw error
    }
  }

  /**
   * Cancel a leave request
   * @param {string} leaveRequestId - The ID of the leave request
   * @param {string} userId - The ID of the user cancelling the request
   * @returns {Promise<Object>} - The updated leave request
   */
  async cancelLeaveRequest(leaveRequestId, userId) {
    return await db.transaction(async (trx) => {
      try {
        // Get the leave request
        const leaveRequest = await trx("leave_requests")
          .where({ id: leaveRequestId })
          .first()

        if (!leaveRequest) {
          throw new Error("Leave request not found")
        }

        // Check if user can cancel this request
        if (leaveRequest.user_id !== userId && !await this._userCanManageRequest(userId, leaveRequest, trx)) {
          throw new Error("You are not authorized to cancel this leave request")
        }

        // Check if request can be cancelled
        if (leaveRequest.status !== "pending") {
          throw new Error("Only pending leave requests can be cancelled")
        }

        // Update the leave request status
        const [updatedRequest] = await trx("leave_requests")
          .where({ id: leaveRequestId })
          .update({
            status: "cancelled",
            updated_at: new Date()
          })
          .returning("*")

        // Update any pending workflow entries
        await trx("leave_approval_workflow")
          .where({ leave_request_id: leaveRequestId, status: "pending" })
          .update({
            status: "cancelled",
            comments: "Request cancelled by user",
            approved_at: new Date()
          })

        return updatedRequest
      } catch (error) {
        console.error("Error cancelling leave request:", error)
        throw error
      }
    })
  }

  /**
   * Check if a user can manage a leave request (for admins/managers)
   * @private
   */
  async _userCanManageRequest(userId, leaveRequest, trx) {
    const user = await trx("users").where({ id: userId }).first()
    if (!user) return false

    // Admins can manage any request
    if (user.role === "admin" || user.is_owner) return true

    // Managers can manage requests from their department
    if (user.role === "manager") {
      const requester = await trx("users").where({ id: leaveRequest.user_id }).first()
      return requester && requester.department === user.department
    }

    return false
  }
}

module.exports = LeaveApprovalService
