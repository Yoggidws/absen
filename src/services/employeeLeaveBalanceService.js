const { db } = require("../config/db")

/**
 * Employee Leave Balance Service
 * This service manages leave balances as part of the employee/HR system
 * and serves as the single source of truth for leave balance data
 */
class EmployeeLeaveBalanceService {
  
  /**
   * Get leave balance configuration based on employee data
   * This determines leave entitlements based on employment details
   */
  getLeaveEntitlements(employee) {
    // All leave balances are now managed manually by HR/admin.
    // New employees will start with zero balances.
    const entitlements = {
      annual_leave: 0,
      sick_leave: 0,
      other_leave: 0,
      long_leave: 0,
      maternity_leave: 0,
      paternity_leave: 0,
      marriage_leave: 0,
      death_leave: 0,
      hajj_umrah_leave: 0
    }

    // The previous logic for automatically granting leave based on
    // employee data is removed to allow for manual management.
    // Admins can use the "Adjust Leave Balance" feature to grant specific entitlements.

    return entitlements
  }

  /**
   * Calculate years of service for an employee
   */
  calculateYearsOfService(hireDate) {
    const hire = new Date(hireDate)
    const now = new Date()
    return Math.floor((now - hire) / (365.25 * 24 * 60 * 60 * 1000))
  }

  /**
   * Get or create leave balance for an employee
   * This is the main method that other systems should call
   */
  async getEmployeeLeaveBalance(userId, year = null) {
    const targetYear = year || new Date().getFullYear()

    // Get employee information
    const employee = await this.getEmployeeByUserId(userId)
    if (!employee) {
      throw new Error(`Employee not found for user ID: ${userId}`)
    }

    // Check if leave balance already exists
    let leaveBalance = await db("leave_balance")
      .where({ user_id: userId, year: targetYear })
      .first()

    if (!leaveBalance) {
      // Create new leave balance based on employee entitlements
      leaveBalance = await this.createLeaveBalance(userId, targetYear, employee)
    }

    return leaveBalance
  }

  /**
   * Create a new leave balance record based on employee data
   */
  async createLeaveBalance(userId, year, employee) {
    const entitlements = this.getLeaveEntitlements(employee)
    
    const leaveBalanceId = this.generateLeaveId("LB")
    
    const [leaveBalance] = await db("leave_balance")
      .insert({
        id: leaveBalanceId,
        user_id: userId,
        year: year,
        ...entitlements,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning("*")

    // Create audit record
    await db("leave_balance_audit").insert({
      id: this.generateLeaveId("LBA"),
      leave_balance_id: leaveBalance.id,
      adjusted_by: 'system',
      adjustment_type: "employee_system_initialization",
      adjustment_amount: 0,
      previous_value: 0,
      new_value: 0,
      notes: `Leave balance initialized from employee system. Employment status: ${employee.employment_status}, Years of service: ${this.calculateYearsOfService(employee.hire_date)}`
    })

    return leaveBalance
  }

  /**
   * Get employee information by user ID
   */
  async getEmployeeByUserId(userId) {
    return await db("employees as e")
      .join("users as u", "e.user_id", "u.id")
      .leftJoin("departments as d", "e.department_id", "d.id")
      .select(
        "e.*",
        "u.name",
        "u.email",
        "u.role",
        "u.active",
        "d.name as department_name"
      )
      .where("e.user_id", userId)
      .first()
  }

  /**
   * Bulk initialize leave balances for all employees
   * Useful for system setup or yearly rollover
   */
  async bulkInitializeLeaveBalances(year = null) {
    const targetYear = year || new Date().getFullYear()
    
    // Get all active employees who don't have leave balance for the year
    const employeesNeedingBalance = await db("employees as e")
      .join("users as u", "e.user_id", "u.id")
      .leftJoin("leave_balance as lb", function() {
        this.on("e.user_id", "=", "lb.user_id")
          .andOn("lb.year", "=", db.raw("?", [targetYear]))
      })
      .where("u.active", true)
      .whereNull("lb.id")
      .select("e.*", "u.name", "u.email")

    const results = []
    
    for (const employee of employeesNeedingBalance) {
      try {
        const leaveBalance = await this.createLeaveBalance(
          employee.user_id, 
          targetYear, 
          employee
        )
        results.push({
          userId: employee.user_id,
          name: employee.full_name || employee.name,
          status: 'success',
          leaveBalance
        })
      } catch (error) {
        results.push({
          userId: employee.user_id,
          name: employee.full_name || employee.name,
          status: 'error',
          error: error.message
        })
      }
    }

    return results
  }

  /**
   * Update leave balance when employee data changes
   */
  async recalculateLeaveBalance(userId, year = null) {
    const targetYear = year || new Date().getFullYear()
    
    const employee = await this.getEmployeeByUserId(userId)
    if (!employee) {
      throw new Error(`Employee not found for user ID: ${userId}`)
    }

    const currentBalance = await db("leave_balance")
      .where({ user_id: userId, year: targetYear })
      .first()

    if (!currentBalance) {
      // No existing balance, create new one
      return await this.createLeaveBalance(userId, targetYear, employee)
    }

    // Calculate new entitlements
    const newEntitlements = this.getLeaveEntitlements(employee)
    
    // Update balance while preserving used amounts
    const updateData = {}
    let hasChanges = false
    
    Object.keys(newEntitlements).forEach(leaveType => {
      if (currentBalance[leaveType] !== newEntitlements[leaveType]) {
        updateData[leaveType] = newEntitlements[leaveType]
        hasChanges = true
      }
    })

    if (hasChanges) {
      updateData.updated_at = new Date()
      
      const [updatedBalance] = await db("leave_balance")
        .where({ id: currentBalance.id })
        .update(updateData)
        .returning("*")

      // Create audit record
      await db("leave_balance_audit").insert({
        id: this.generateLeaveId("LBA"),
        leave_balance_id: currentBalance.id,
        adjusted_by: 'system',
        adjustment_type: "employee_data_update",
        adjustment_amount: 0,
        previous_value: 0,
        new_value: 0,
        notes: `Leave balance recalculated due to employee data changes`
      })

      return updatedBalance
    }

    return currentBalance
  }

  /**
   * Get leave balance statistics by department
   */
  async getLeaveBalanceStatsByDepartment(year = null) {
    const targetYear = year || new Date().getFullYear()
    
    return await db("leave_balance as lb")
      .join("employees as e", "lb.user_id", "e.user_id")
      .leftJoin("departments as d", "e.department_id", "d.id")
      .where("lb.year", targetYear)
      .groupBy("d.name", "e.department")
      .select(
        db.raw("COALESCE(d.name, e.department) as department_name"),
        db.raw("COUNT(*) as employee_count"),
        db.raw("AVG(lb.annual_leave) as avg_annual_leave"),
        db.raw("AVG(lb.sick_leave) as avg_sick_leave"),
        db.raw("SUM(lb.annual_leave) as total_annual_leave"),
        db.raw("SUM(lb.sick_leave) as total_sick_leave")
      )
  }

  /**
   * Helper method to generate leave IDs
   */
  generateLeaveId(prefix = "LV") {
    const now = new Date()
    const year = now.getFullYear().toString().slice(-2)
    const month = (now.getMonth() + 1).toString().padStart(2, "0")
    const day = now.getDate().toString().padStart(2, "0")
    const timestamp = Date.now().toString().slice(-6)
    return `${prefix}${year}${month}${day}${timestamp}`
  }

  /**
   * Manually adjust a leave balance for a specific leave type
   */
  async adjustLeaveBalance({ userId, leaveType, adjustmentType, amount, reason, actorId, year = null }) {
    const targetYear = year || new Date().getFullYear()

    // Ensure leave balance exists for the user and year
    const leaveBalance = await this.getEmployeeLeaveBalance(userId, targetYear)

    const leaveTypeField = `${leaveType}_leave`

    if (!(leaveTypeField in leaveBalance)) {
      throw new Error(`Invalid leave type: ${leaveType}`)
    }

    const previousValue = parseFloat(leaveBalance[leaveTypeField]) || 0
    let newValue

    if (adjustmentType === 'add') {
      newValue = previousValue + amount
    } else if (adjustmentType === 'reduce') {
      newValue = previousValue - amount
      if (newValue < 0) {
        throw new Error("Leave balance cannot be negative")
      }
    } else {
      throw new Error("Invalid adjustment type")
    }

    // Update the leave balance
    const [updatedBalance] = await db("leave_balance")
      .where({ id: leaveBalance.id })
      .update({
        [leaveTypeField]: newValue,
        updated_at: new Date()
      })
      .returning("*")

    // Create audit record
    await db("leave_balance_audit").insert({
      id: this.generateLeaveId("LBA"),
      leave_balance_id: leaveBalance.id,
      adjusted_by: actorId,
      adjustment_type: `manual_${adjustmentType}`,
      adjustment_amount: adjustmentType === 'add' ? amount : -amount,
      previous_value: previousValue,
      new_value: newValue,
      notes: reason
    })

    return updatedBalance
  }
}

module.exports = new EmployeeLeaveBalanceService() 