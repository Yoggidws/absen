const { db } = require("../config/db")
const emailUtils = require("../utils/emailUtils")

/**
 * Service to handle the multi-level approval workflow for leave requests
 */
class LeaveApprovalService {
  /**
   * Initialize the approval workflow for a new leave request
   * @param {string} leaveRequestId - The ID of the leave request
   * @param {string} userId - The ID of the user who created the request
   * @returns {Promise<Array>} - The created approval workflow steps
   */
  async initializeWorkflow(leaveRequestId, userId) {
    try {
      // Get the employee's department
      const employee = await db("users").where({ id: userId }).first()
      if (!employee) {
        throw new Error("Employee not found")
      }

      // Find department manager
      let departmentManager = null
      if (employee.department) {
        // First try to find department manager from departments table
        const department = await db("departments").where({ name: employee.department }).first()

        if (department && department.manager_id) {
          departmentManager = await db("users").where({ id: department.manager_id }).first()
        }

        // If no department manager found, find any manager in the same department
        if (!departmentManager) {
          departmentManager = await db("users")
            .where({
              department: employee.department,
              role: "manager",
              active: true,
            })
            .first()
        }
      }

      // Find HR personnel (assuming they have a department called "HR" or "Human Resources")
      const hrPersonnel = await db("users")
        .where((builder) => {
          builder.where({ department: "HR", active: true })
            .orWhere({ department: "Human Resources", active: true })
        })
        .andWhere({ role: "manager" })
        .first()

      // Find an admin
      const admin = await db("users")
        .where({
          role: "admin",
          active: true,
        })
        .first()

      // Create workflow steps
      const workflowSteps = []
      const workflowIds = []

      // Level 1: Department Manager
      if (departmentManager) {
        const level1Id = "WF-" + Math.random().toString(36).substring(2, 10).toUpperCase()
        workflowSteps.push({
          id: level1Id,
          leave_request_id: leaveRequestId,
          approval_level: 1,
          approver_id: departmentManager.id,
          status: "pending",
          created_at: new Date(),
          updated_at: new Date(),
        })
        workflowIds.push(level1Id)
      }

      // Level 2: HR
      if (hrPersonnel) {
        const level2Id = "WF-" + Math.random().toString(36).substring(2, 10).toUpperCase()
        workflowSteps.push({
          id: level2Id,
          leave_request_id: leaveRequestId,
          approval_level: 2,
          approver_id: hrPersonnel.id,
          status: "pending",
          created_at: new Date(),
          updated_at: new Date(),
        })
        workflowIds.push(level2Id)
      }

      // Level 3: Admin
      if (admin) {
        const level3Id = "WF-" + Math.random().toString(36).substring(2, 10).toUpperCase()
        workflowSteps.push({
          id: level3Id,
          leave_request_id: leaveRequestId,
          approval_level: 3,
          approver_id: admin.id,
          status: "pending",
          created_at: new Date(),
          updated_at: new Date(),
        })
        workflowIds.push(level3Id)
      }

      // Insert workflow steps
      if (workflowSteps.length > 0) {
        await db("leave_approval_workflow").insert(workflowSteps)

        // Update leave request status to in_progress and set current approval level to 1
        await db("leave_requests")
          .where({ id: leaveRequestId })
          .update({
            status: "in_progress",
            current_approval_level: 1,
            updated_at: new Date(),
          })

        // Send notification to the first approver
        if (workflowSteps.length > 0 && workflowSteps[0].approver_id) {
          const leaveRequest = await db("leave_requests")
            .join("users", "leave_requests.user_id", "users.id")
            .where("leave_requests.id", leaveRequestId)
            .select(
              "leave_requests.*",
              "users.name as user_name",
              "users.email as user_email"
            )
            .first()

          const approver = await db("users").where({ id: workflowSteps[0].approver_id }).first()

          if (leaveRequest && approver) {
            try {
              await emailUtils.sendLeaveApprovalNotification(leaveRequest, approver, 1)
            } catch (error) {
              console.error("Failed to send approval notification:", error)
            }
          }
        }
      }

      return workflowSteps
    } catch (error) {
      console.error("Error initializing approval workflow:", error)
      throw error
    }
  }

  /**
   * Process an approval or rejection at a specific level
   * @param {string} leaveRequestId - The ID of the leave request
   * @param {number} approvalLevel - The approval level (1, 2, or 3)
   * @param {string} approverId - The ID of the approver
   * @param {string} status - The new status ("approved" or "rejected")
   * @param {string} comments - Comments from the approver
   * @returns {Promise<Object>} - The updated leave request
   */
  async processApproval(leaveRequestId, approvalLevel, approverId, status, comments) {
    try {
      // Get the leave request
      const leaveRequest = await db("leave_requests").where({ id: leaveRequestId }).first()
      if (!leaveRequest) {
        throw new Error("Leave request not found")
      }

      // Check if this is the current approval level
      if (leaveRequest.current_approval_level !== approvalLevel) {
        throw new Error(`Cannot process approval at level ${approvalLevel}. Current level is ${leaveRequest.current_approval_level}`)
      }

      // Update the workflow step
      await db("leave_approval_workflow")
        .where({
          leave_request_id: leaveRequestId,
          approval_level: approvalLevel,
        })
        .update({
          approver_id: approverId,
          status: status,
          comments: comments,
          updated_at: new Date(),
        })

      // If rejected, update the leave request status
      if (status === "rejected") {
        await db("leave_requests")
          .where({ id: leaveRequestId })
          .update({
            status: "rejected",
            approved_by: approverId, // For backward compatibility
            approval_notes: comments, // For backward compatibility
            updated_at: new Date(),
          })

        // Notify the employee
        await this.notifyEmployee(leaveRequestId, "rejected", approverId, approvalLevel)

        return await db("leave_requests").where({ id: leaveRequestId }).first()
      }

      // If approved, check if there are more levels
      const nextLevel = approvalLevel + 1
      const nextWorkflowStep = await db("leave_approval_workflow")
        .where({
          leave_request_id: leaveRequestId,
          approval_level: nextLevel,
        })
        .first()

      if (nextWorkflowStep) {
        // Move to the next approval level
        await db("leave_requests")
          .where({ id: leaveRequestId })
          .update({
            current_approval_level: nextLevel,
            updated_at: new Date(),
          })

        // Notify the next approver
        const approver = await db("users").where({ id: nextWorkflowStep.approver_id }).first()
        if (approver) {
          const leaveRequestDetails = await db("leave_requests")
            .join("users", "leave_requests.user_id", "users.id")
            .where("leave_requests.id", leaveRequestId)
            .select(
              "leave_requests.*",
              "users.name as user_name",
              "users.email as user_email"
            )
            .first()

          try {
            await emailUtils.sendLeaveApprovalNotification(leaveRequestDetails, approver, nextLevel)
          } catch (error) {
            console.error("Failed to send approval notification:", error)
          }
        }
      } else {
        // Final approval, update the leave request status
        await db("leave_requests")
          .where({ id: leaveRequestId })
          .update({
            status: "approved",
            approved_by: approverId, // For backward compatibility
            approval_notes: comments, // For backward compatibility
            updated_at: new Date(),
          })

        // Update leave balance
        await this.updateLeaveBalance(leaveRequestId)

        // Notify the employee
        await this.notifyEmployee(leaveRequestId, "approved", approverId, approvalLevel)
      }

      return await db("leave_requests").where({ id: leaveRequestId }).first()
    } catch (error) {
      console.error("Error processing approval:", error)
      throw error
    }
  }

  /**
   * Update the leave balance after final approval
   * @param {string} leaveRequestId - The ID of the leave request
   */
  async updateLeaveBalance(leaveRequestId) {
    try {
      // Get the leave request
      const leaveRequest = await db("leave_requests").where({ id: leaveRequestId }).first()
      if (!leaveRequest) {
        throw new Error("Leave request not found")
      }

      // Calculate the number of days
      const startDate = new Date(leaveRequest.start_date)
      const endDate = new Date(leaveRequest.end_date)
      const diffTime = Math.abs(endDate - startDate)
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1 // +1 to include both start and end dates

      // Get the current year
      const currentYear = new Date().getFullYear()

      // Get or create leave balance record
      let leaveBalance = await db("leave_balance")
        .where({
          user_id: leaveRequest.user_id,
          year: currentYear
        })
        .first()

      if (!leaveBalance) {
        // Create a new leave balance record if it doesn't exist
        const newLeaveBalanceId = `LB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`

        [leaveBalance] = await db("leave_balance")
          .insert({
            id: newLeaveBalanceId,
            user_id: leaveRequest.user_id,
            year: currentYear,
            total_allowance: 20,
            used_days: 0,
            remaining_days: 20,
            carried_over: 0,
            sick_allowance: 10,
            sick_used: 0,
            personal_allowance: 5,
            personal_used: 0
          })
          .returning("*")
      }

      // Update the appropriate leave balance fields based on leave type
      const updateData = {}

      // Update used days and remaining days for all leave types
      updateData.used_days = leaveBalance.used_days + diffDays
      updateData.remaining_days = leaveBalance.total_allowance - updateData.used_days

      // Update specific leave type counters
      if (leaveRequest.type === "sick") {
        updateData.sick_used = leaveBalance.sick_used + diffDays
      } else if (leaveRequest.type === "personal") {
        updateData.personal_used = leaveBalance.personal_used + diffDays
      }

      // Update the leave balance
      await db("leave_balance")
        .where({ id: leaveBalance.id })
        .update(updateData)
    } catch (error) {
      console.error("Error updating leave balance:", error)
      throw error
    }
  }

  /**
   * Notify the employee about the status of their leave request
   * @param {string} leaveRequestId - The ID of the leave request
   * @param {string} status - The status of the leave request
   * @param {string} approverId - The ID of the approver
   * @param {number} approvalLevel - The approval level
   */
  async notifyEmployee(leaveRequestId, status, approverId, approvalLevel) {
    try {
      // Get the leave request with employee details
      const leaveRequest = await db("leave_requests")
        .join("users as u", "leave_requests.user_id", "u.id")
        .where("leave_requests.id", leaveRequestId)
        .select(
          "leave_requests.*",
          "u.name as user_name",
          "u.email as user_email"
        )
        .first()

      if (!leaveRequest) {
        throw new Error("Leave request not found")
      }

      // Get the approver details
      const approver = await db("users").where({ id: approverId }).first()
      if (!approver) {
        throw new Error("Approver not found")
      }

      // Send email notification
      try {
        await emailUtils.sendLeaveStatusUpdate(leaveRequest, {
          name: leaveRequest.user_name,
          email: leaveRequest.user_email
        }, status, approver, approvalLevel)
      } catch (error) {
        console.error("Failed to send leave status update:", error)
      }
    } catch (error) {
      console.error("Error notifying employee:", error)
      throw error
    }
  }

  /**
   * Get the approval workflow for a leave request
   * @param {string} leaveRequestId - The ID of the leave request
   * @returns {Promise<Array>} - The approval workflow steps with approver details
   */
  async getApprovalWorkflow(leaveRequestId) {
    try {
      const workflow = await db("leave_approval_workflow as law")
        .leftJoin("users as u", "law.approver_id", "u.id")
        .where("law.leave_request_id", leaveRequestId)
        .orderBy("law.approval_level", "asc")
        .select(
          "law.*",
          "u.name as approver_name",
          "u.email as approver_email",
          "u.department as approver_department",
          "u.role as approver_role"
        )

      return workflow
    } catch (error) {
      console.error("Error getting approval workflow:", error)
      throw error
    }
  }

  /**
   * Get pending approvals for a specific user
   * @param {string} userId - The ID of the user
   * @returns {Promise<Array>} - The pending approvals
   */
  async getPendingApprovalsForUser(userId) {
    try {
      const pendingApprovals = await db("leave_approval_workflow as law")
        .join("leave_requests as lr", "law.leave_request_id", "lr.id")
        .join("users as requester", "lr.user_id", "requester.id")
        .where("law.approver_id", userId)
        .andWhere("law.status", "pending")
        .andWhereRaw("lr.current_approval_level = law.approval_level") // Only show if it's the current level
        .select(
          "law.*",
          "lr.type as leave_type",
          "lr.start_date",
          "lr.end_date",
          "lr.reason",
          "lr.status as leave_status",
          "requester.name as requester_name",
          "requester.email as requester_email",
          "requester.department as requester_department"
        )
        .orderBy("lr.created_at", "desc")

      return pendingApprovals
    } catch (error) {
      console.error("Error getting pending approvals:", error)
      throw error
    }
  }
}

module.exports = new LeaveApprovalService()
