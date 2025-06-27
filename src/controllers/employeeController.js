const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const { generateUserId } = require("./UserController")
const { v4: uuidv4 } = require("uuid")
const employeeLeaveBalanceService = require("../services/employeeLeaveBalanceService")

/**
 * @desc    Get all employees
 * @route   GET /api/employees
 * @access  Private
 */
exports.getAllEmployees = asyncHandler(async (req, res) => {
  const { department, status, search, page = 1, limit = 50 } = req.query
  const offset = (page - 1) * limit

  let query = db("employees as e")
    .join("users as u", "e.user_id", "u.id")
    .leftJoin("departments as d", "e.department_id", "d.id")
    .select(
      "e.employee_id",
      "u.id as user_id",
      "e.full_name",
      "e.email",
      "e.department",
      "u.name",
      "u.role",
      "u.active",
      "u.created_at as user_created_at",
      "d.name as department_name"
    )

  if (department) {
    query = query.where("e.department", department)
  }

  if (status) {
    query = query.where("e.employment_status", status)
  }

  if (search) {
    query = query.where(function() {
      this.where("e.full_name", "ilike", `%${search}%`)
        .orWhere("u.email", "ilike", `%${search}%`)
        .orWhere("e.employee_id", "ilike", `%${search}%`)
        .orWhere("e.position", "ilike", `%${search}%`)
    })
  }

  const employees = await query
    .orderBy("e.full_name", "asc")
    .limit(limit)
    .offset(offset)

  const totalCount = await db("employees as e")
    .join("users as u", "e.user_id", "u.id")
    .count("* as count")
    .first()

  res.status(200).json({
    success: true,
    count: employees.length,
    total: parseInt(totalCount.count),
    page: parseInt(page),
    totalPages: Math.ceil(totalCount.count / limit),
    data: employees,
  })
})

/**
 * @desc    Get employee by ID
 * @route   GET /api/employees/:id
 * @access  Private
 */
exports.getEmployeeById = asyncHandler(async (req, res) => {
  const { id } = req.params

  const employee = await db("employees as e")
    .join("users as u", "e.user_id", "u.id")
    .leftJoin("departments as d", "e.department_id", "d.id")
    .select(
      "e.employee_id",
      "u.id as user_id",
      "e.full_name",
      "e.email",
      "e.department",
      "u.name",
      "u.role",
      "u.active",
      "u.created_at as user_created_at",
      "d.name as department_name"
    )
    .where("e.user_id", id)
    .orWhere("e.employee_id", id)
    .first()

  if (!employee) {
    res.status(404)
    throw new Error("Employee not found")
  }

  res.status(200).json({
    success: true,
    data: employee,
  })
})

/**
 * @desc    Create new employee
 * @route   POST /api/employees
 * @access  Private/Admin
 */
exports.createEmployee = asyncHandler(async (req, res) => {
  const {
    full_name,
    email,
    gender,
    place_of_birth,
    date_of_birth,
    address,
    phone_number,
    marital_status,
    number_of_children,
    position,
    department,
    hire_date,
    employment_status,
    basic_salary,
    allowance,
    password
  } = req.body

  // Check if user already exists
  const existingUser = await db("users").where({ email }).first()
  if (existingUser) {
    res.status(400)
    throw new Error("User with this email already exists")
  }

  // Generate employee ID and user ID
  const userId = await generateUserId()
  const employeeId = userId // Use same ID for consistency

  await db.transaction(async (trx) => {
    // Create user account
    const hashedPassword = password ? 
      await require("bcryptjs").hash(password, 10) : 
      await require("bcryptjs").hash("defaultpassword123", 10)

    await trx("users").insert({
      id: userId,
      name: full_name,
      email,
      password: hashedPassword,
      department,
      position,
      role: "employee",
      active: true
    })

    // Get department ID
    let departmentId = null
    if (department) {
      const dept = await trx("departments").where({ name: department }).first()
      departmentId = dept?.id || null
    }

    // Create employee record
    await trx("employees").insert({
      employee_id: employeeId,
      full_name,
      gender: gender || "other",
      place_of_birth: place_of_birth || "",
      date_of_birth: date_of_birth || new Date("1900-01-01"),
      address: address || "",
      phone_number: phone_number || "",
      email,
      marital_status: marital_status || "single",
      number_of_children: number_of_children || 0,
      position: position || "",
      department: department || "",
      department_id: departmentId,
      hire_date: hire_date || new Date(),
      employment_status: employment_status || "permanent",
      basic_salary: basic_salary || 0,
      allowance: allowance || 0,
      user_id: userId
    })

    // The automatic creation of a leave balance has been removed.
    // A leave balance record with zero values will be created automatically 
    // the first time it's needed (e.g., when an admin views the balance page).
    // This ensures new users start with no leave data.
  })

  const newEmployee = await db("employees as e")
    .join("users as u", "e.user_id", "u.id")
    .leftJoin("departments as d", "e.department_id", "d.id")
    .select(
      "e.employee_id",
      "u.id as user_id",
      "e.full_name",
      "e.email",
      "e.department",
      "u.name",
      "u.role",
      "u.active",
      "d.name as department_name"
    )
    .where("e.employee_id", employeeId)
    .first()

  res.status(201).json({
    success: true,
    data: newEmployee,
  })
})

/**
 * @desc    Update employee
 * @route   PUT /api/employees/:id
 * @access  Private/Admin
 */
exports.updateEmployee = asyncHandler(async (req, res) => {
  const { id } = req.params
  const updateData = req.body

  const employee = await db("employees").where("employee_id", id).first()
  if (!employee) {
    res.status(404)
    throw new Error("Employee not found")
  }

  await db.transaction(async (trx) => {
    // Update employee record
    const employeeUpdateData = {}
    const allowedEmployeeFields = [
      "full_name", "gender", "place_of_birth", "date_of_birth", "address",
      "phone_number", "marital_status", "number_of_children", "position",
      "department", "employment_status", "basic_salary", "allowance"
    ]

    allowedEmployeeFields.forEach(field => {
      if (updateData[field] !== undefined) {
        employeeUpdateData[field] = updateData[field]
      }
    })

    if (Object.keys(employeeUpdateData).length > 0) {
      await trx("employees").where("employee_id", id).update(employeeUpdateData)
    }

    // Update user record if needed
    const userUpdateData = {}
    const allowedUserFields = ["name", "email", "department", "position", "role", "active"]

    allowedUserFields.forEach(field => {
      if (updateData[field] !== undefined) {
        userUpdateData[field] = updateData[field]
      }
    })

    if (Object.keys(userUpdateData).length > 0) {
      await trx("users").where("id", employee.user_id).update(userUpdateData)
    }

    // Update department_id if department changed
    if (updateData.department) {
      const dept = await trx("departments").where({ name: updateData.department }).first()
      await trx("employees").where("employee_id", id).update({ department_id: dept?.id || null })
    }

    // **INTEGRATION POINT**: Recalculate leave balance if relevant employee data changed
    // This ensures leave entitlements are automatically updated when employee status changes
    const fieldsAffectingLeaveBalance = ['employment_status', 'hire_date']
    const shouldRecalculateBalance = fieldsAffectingLeaveBalance.some(field => 
      updateData[field] !== undefined
    )

    if (shouldRecalculateBalance) {
      try {
        await employeeLeaveBalanceService.recalculateLeaveBalance(employee.user_id)
        console.log(`Leave balance recalculated for employee ${id} due to data changes`)
      } catch (error) {
        console.error(`Failed to recalculate leave balance for employee ${id}:`, error.message)
        // Don't fail the transaction, just log the error
      }
    }
  })

  const updatedEmployee = await db("employees as e")
    .join("users as u", "e.user_id", "u.id")
    .leftJoin("departments as d", "e.department_id", "d.id")
    .select(
      "e.employee_id",
      "u.id as user_id",
      "e.full_name",
      "e.email",
      "e.department",
      "u.name",
      "u.role",
      "u.active",
      "d.name as department_name"
    )
    .where("e.employee_id", id)
    .first()

  res.status(200).json({
    success: true,
    data: updatedEmployee,
  })
})

/**
 * @desc    Delete employee
 * @route   DELETE /api/employees/:id
 * @access  Private/Admin
 */
exports.deleteEmployee = asyncHandler(async (req, res) => {
  const { id } = req.params

  const employee = await db("employees").where("employee_id", id).first()
  if (!employee) {
    res.status(404)
    throw new Error("Employee not found")
  }

  await db.transaction(async (trx) => {
    // Soft delete - deactivate user instead of deleting
    await trx("users").where("id", employee.user_id).update({ active: false })
    await trx("employees").where("employee_id", id).update({ employment_status: "terminated" })
  })

  res.status(200).json({
    success: true,
    message: "Employee deactivated successfully",
  })
})

/**
 * @desc    Get employees in onboarding process
 * @route   GET /api/employees/onboarding
 * @access  Private/Admin/HR
 */
exports.getOnboardingEmployees = asyncHandler(async (req, res) => {
  // Only admin and HR can access onboarding data
  if (!req.hasAnyRole(["admin", "hr", "hr_manager"])) {
    res.status(403)
    throw new Error("Not authorized to view onboarding data")
  }

  const onboardingEmployees = await db("employees as e")
    .join("users as u", "e.user_id", "u.id")
    .leftJoin("departments as d", "e.department_id", "d.id")
    .where("e.employment_status", "probation")
    .andWhere("u.active", true)
    .select(
      "e.employee_id",
      "e.user_id",
      "e.full_name",
      "e.email",
      "e.department",
      "e.position",
      "e.employment_status",
      "e.hire_date",
      "d.name as department_name"
    )
    .orderBy("e.hire_date", "desc")

  res.status(200).json({
    success: true,
    count: onboardingEmployees.length,
    data: onboardingEmployees
  })
})

/**
 * @desc    Get employees in offboarding process
 * @route   GET /api/employees/offboarding
 * @access  Private/Admin/HR
 */
exports.getOffboardingEmployees = asyncHandler(async (req, res) => {
  // Only admin and HR can access offboarding data
  if (!req.hasAnyRole(["admin", "hr", "hr_manager"])) {
    res.status(403)
    throw new Error("Not authorized to view offboarding data")
  }

  try {
    const offboardingEmployees = await db("employees as e")
      .join("users as u", "e.user_id", "u.id")
      .leftJoin("departments as d", "e.department_id", "d.id")
      .where(function() {
        this.where("u.active", false).orWhere("e.employment_status", "terminated")
      })
      .select(
        "e.employee_id",
        "e.user_id",
        "e.full_name",
        "e.email",
        "e.department",
        "e.position",
        "e.employment_status",
        "e.hire_date",
        "e.termination_date",
        "e.termination_reason",
        "d.name as department_name"
      )
      .orderBy("e.termination_date", "desc")
      .orderBy("e.updated_at", "desc")

    res.status(200).json({
      success: true,
      count: offboardingEmployees.length,
      data: offboardingEmployees.map(emp => ({
        ...emp,
        termination_date: emp.termination_date || null,
        termination_reason: emp.termination_reason || null
      }))
    })

  } catch (error) {
    console.error("Error in getOffboardingEmployees:", error)
    res.status(500)
    throw new Error(`Failed to get offboarding employees: ${error.message}`)
  }
})

/**
 * @desc    Get employee statistics
 * @route   GET /api/employees/stats
 * @access  Private/Admin/HR
 */
exports.getEmployeeStats = asyncHandler(async (req, res) => {
  // Only admin and HR can access employee statistics
  if (!req.hasAnyRole(["admin", "hr", "hr_manager"])) {
    res.status(403)
    throw new Error("Not authorized to view employee statistics")
  }

  // Get total employees count
  const totalEmployees = await db("employees as e")
    .join("users as u", "e.user_id", "u.id")
    .where("u.active", true)
    .count("e.employee_id as count")
    .first()

  // Get department statistics
  const departmentStats = await db("employees as e")
    .join("users as u", "e.user_id", "u.id")
    .where("u.active", true)
    .select("e.department")
    .count("e.employee_id as count")
    .groupBy("e.department")
    .orderBy("count", "desc")

  // Get employment status statistics
  const employmentStatusStats = await db("employees as e")
    .join("users as u", "e.user_id", "u.id")
    .where("u.active", true)
    .select("e.employment_status")
    .count("e.employee_id as count")
    .groupBy("e.employment_status")
    .orderBy("count", "desc")

  // Get recent hires (last 30 days)
  const recentHires = await db("employees as e")
    .join("users as u", "e.user_id", "u.id")
    .where("u.active", true)
    .andWhere("e.hire_date", ">=", db.raw("CURRENT_DATE - INTERVAL '30 days'"))
    .count("e.employee_id as count")
    .first()

  res.status(200).json({
    success: true,
    data: {
      totalEmployees: parseInt(totalEmployees.count),
      departmentStats: departmentStats.map(stat => ({
        department: stat.department || 'Unknown',
        count: parseInt(stat.count)
      })),
      employmentStatusStats: employmentStatusStats.map(stat => ({
        employment_status: stat.employment_status,
        count: parseInt(stat.count)
      })),
      recentHires: parseInt(recentHires.count)
    },
  })
})

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
 * @desc    Get employee leave balance (HR System - Single Source of Truth)
 * @route   GET /api/employees/:id/leave-balance
 * @access  Private
 */
exports.getEmployeeLeaveBalance = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { year } = req.query

  // Find employee by ID (can be employee_id or user_id)
  const employee = await db("employees as e")
    .join("users as u", "e.user_id", "u.id")
    .select("e.*", "u.name", "u.email", "u.role", "u.active")
    .where("e.employee_id", id)
    .orWhere("e.user_id", id)
    .first()

  if (!employee) {
    res.status(404)
    throw new Error("Employee not found")
  }

  // Check authorization - employees can only see their own data unless admin/hr
  if (req.user.id !== employee.user_id && !req.hasAnyRole(["admin", "hr", "manager"])) {
    res.status(403)
    throw new Error("Not authorized to view this employee's leave balance")
  }

  try {
    const leaveBalance = await employeeLeaveBalanceService.getEmployeeLeaveBalance(
      employee.user_id, 
      year ? parseInt(year) : null
    )

    // Calculate usage from leave requests
    const targetYear = year ? parseInt(year) : new Date().getFullYear()
    const approvedLeaves = await db("leave_requests")
      .where({ 
        user_id: employee.user_id, 
        status: "approved" 
      })
      .whereRaw("EXTRACT(YEAR FROM start_date) = ? OR EXTRACT(YEAR FROM end_date) = ?", [targetYear, targetYear])

    const usage = {}
    const leaveTypeMap = {
      "annual": "annual_leave", 
      "sick": "sick_leave", 
      "long": "long_leave",
      "maternity": "maternity_leave", 
      "paternity": "paternity_leave",
      "marriage": "marriage_leave", 
      "death": "death_leave", 
      "hajj_umrah": "hajj_umrah_leave"
    }

    // Initialize usage counters
    Object.values(leaveTypeMap).forEach(field => {
      usage[field] = 0
    })

    // Calculate used days
    approvedLeaves.forEach(leave => {
      const startDate = new Date(leave.start_date)
      const endDate = new Date(leave.end_date)
      const diffTime = Math.abs(endDate - startDate)
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1

      const balanceField = leaveTypeMap[leave.type]
      if (balanceField) {
        usage[balanceField] += days
      }
    })

    // Format response with both entitlements and usage
    const response = {
      employee: {
        id: employee.employee_id,
        user_id: employee.user_id,
        name: employee.full_name || employee.name,
        email: employee.email,
        department: employee.department,
        position: employee.position,
        employment_status: employee.employment_status,
        hire_date: employee.hire_date
      },
      year: targetYear,
      leave_balance: {
        id: leaveBalance.id,
        annual_leave: {
          entitled: leaveBalance.annual_leave,
          used: usage.annual_leave,
          remaining: Math.max(0, leaveBalance.annual_leave - usage.annual_leave)
        },
        sick_leave: {
          entitled: leaveBalance.sick_leave,
          used: usage.sick_leave,
          remaining: Math.max(0, leaveBalance.sick_leave - usage.sick_leave)
        },
        long_leave: {
          entitled: leaveBalance.long_leave,
          used: usage.long_leave,
          remaining: Math.max(0, leaveBalance.long_leave - usage.long_leave)
        },
        maternity_leave: {
          entitled: leaveBalance.maternity_leave,
          used: usage.maternity_leave,
          remaining: Math.max(0, leaveBalance.maternity_leave - usage.maternity_leave)
        },
        paternity_leave: {
          entitled: leaveBalance.paternity_leave,
          used: usage.paternity_leave,
          remaining: Math.max(0, leaveBalance.paternity_leave - usage.paternity_leave)
        },
        marriage_leave: {
          entitled: leaveBalance.marriage_leave,
          used: usage.marriage_leave,
          remaining: Math.max(0, leaveBalance.marriage_leave - usage.marriage_leave)
        },
        death_leave: {
          entitled: leaveBalance.death_leave,
          used: usage.death_leave,
          remaining: Math.max(0, leaveBalance.death_leave - usage.death_leave)
        },
        hajj_umrah_leave: {
          entitled: leaveBalance.hajj_umrah_leave,
          used: usage.hajj_umrah_leave,
          remaining: Math.max(0, leaveBalance.hajj_umrah_leave - usage.hajj_umrah_leave)
        }
      }
    }

    res.status(200).json({
      success: true,
      data: response
    })

  } catch (error) {
    res.status(500)
    throw new Error(`Failed to get leave balance: ${error.message}`)
  }
})

/**
 * @desc    Get leave balances for all employees (HR System API)
 * @route   GET /api/employees/leave-balances
 * @access  Private/Admin/HR
 */
exports.getAllEmployeesLeaveBalances = asyncHandler(async (req, res) => {
  // Only admin and HR can access all employee leave balances
  if (!req.hasAnyRole(["admin", "hr", "hr_manager"])) {
    res.status(403)
    throw new Error("Not authorized to view all employee leave balances")
  }

  const { year, department, employment_status } = req.query
  const targetYear = year ? parseInt(year) : new Date().getFullYear()

  try {
    // Get all active employees with their leave balances
    let query = db("employees as e")
      .join("users as u", "e.user_id", "u.id")
      .leftJoin("departments as d", "e.department_id", "d.id")
      .leftJoin("leave_balance as lb", function() {
        this.on("e.user_id", "=", "lb.user_id")
          .andOn("lb.year", "=", db.raw("?", [targetYear]))
      })
      .where("u.active", true)
      .select(
        "e.employee_id",
        "u.id as user_id",
        "e.full_name",
        "e.email",
        "e.department",
        "e.position",
        "e.employment_status",
        "e.hire_date",
        "d.name as department_name",
        "lb.id as lb_id",
        "lb.year as lb_year",
        "lb.annual_leave",
        "lb.sick_leave",
        "lb.long_leave",
        "lb.maternity_leave",
        "lb.paternity_leave",
        "lb.marriage_leave",
        "lb.death_leave",
        "lb.hajj_umrah_leave"
      )

    // Apply filters
    if (department) {
      query = query.where("e.department", department)
    }

    if (employment_status) {
      query = query.where("e.employment_status", employment_status)
    }

    const employees = await query.orderBy("e.full_name", "asc")

    // Map the results directly without the problematic loop
    const results = employees.map(employee => {
      const leaveBalance = employee.lb_id ? {
        id: employee.lb_id,
        user_id: employee.user_id,
        year: employee.lb_year,
        annual_leave: employee.annual_leave,
        sick_leave: employee.sick_leave,
        long_leave: employee.long_leave,
        maternity_leave: employee.maternity_leave,
        paternity_leave: employee.paternity_leave,
        marriage_leave: employee.marriage_leave,
        death_leave: employee.death_leave,
        hajj_umrah_leave: employee.hajj_umrah_leave
      } : null;

      return {
        employee: {
          id: employee.employee_id,
          user_id: employee.user_id,
          name: employee.full_name,
          email: employee.email,
          department: employee.department,
          department_name: employee.department_name,
          position: employee.position,
          employment_status: employee.employment_status,
          hire_date: employee.hire_date
        },
        leave_balance: leaveBalance
      };
    });

    res.status(200).json({
      success: true,
      count: results.length,
      year: targetYear,
      data: results
    })

  } catch (error) {
    res.status(500)
    throw new Error(`Failed to get employee leave balances: ${error.message}`)
  }
})

/**
 * @desc    Bulk initialize leave balances for employees
 * @route   POST /api/employees/leave-balances/initialize
 * @access  Private/Admin/HR
 */
exports.bulkInitializeLeaveBalances = asyncHandler(async (req, res) => {
  // Only admin and HR can initialize leave balances
  if (!req.hasAnyRole(["admin", "hr", "hr_manager"])) {
    res.status(403)
    throw new Error("Not authorized to initialize leave balances")
  }

  const { year } = req.body
  const targetYear = year ? parseInt(year) : new Date().getFullYear()

  try {
    const results = await employeeLeaveBalanceService.bulkInitializeLeaveBalances(targetYear)

    res.status(200).json({
      success: true,
      year: targetYear,
      processed: results.length,
      results
    })

  } catch (error) {
    res.status(500)
    throw new Error(`Failed to bulk initialize leave balances: ${error.message}`)
  }
})

/**
 * @desc    Recalculate employee leave balance based on current employee data
 * @route   POST /api/employees/:id/leave-balance/recalculate
 * @access  Private/Admin/HR
 */
exports.recalculateEmployeeLeaveBalance = asyncHandler(async (req, res) => {
  // Only admin and HR can recalculate leave balances
  if (!req.hasAnyRole(["admin", "hr", "hr_manager"])) {
    res.status(403)
    throw new Error("Not authorized to recalculate leave balances")
  }

  const { id } = req.params
  const { year } = req.body

  // Find employee
  const employee = await db("employees")
    .where("employee_id", id)
    .orWhere("user_id", id)
    .first()

  if (!employee) {
    res.status(404)
    throw new Error("Employee not found")
  }

  try {
    const updatedBalance = await employeeLeaveBalanceService.recalculateLeaveBalance(
      employee.user_id,
      year ? parseInt(year) : null
    )

    res.status(200).json({
      success: true,
      message: "Leave balance recalculated successfully",
      data: updatedBalance
    })

  } catch (error) {
    res.status(500)
    throw new Error(`Failed to recalculate leave balance: ${error.message}`)
  }
})

/**
 * @desc    Get leave balance statistics by department
 * @route   GET /api/employees/leave-balance-stats
 * @access  Private/Admin/HR
 */
exports.getLeaveBalanceStatistics = asyncHandler(async (req, res) => {
  // Only admin and HR can access statistics
  if (!req.hasAnyRole(["admin", "hr", "hr_manager"])) {
    res.status(403)
    throw new Error("Not authorized to view leave balance statistics")
  }

  const { year } = req.query

  try {
    const stats = await employeeLeaveBalanceService.getLeaveBalanceStatsByDepartment(
      year ? parseInt(year) : null
    )

    res.status(200).json({
      success: true,
      year: year ? parseInt(year) : new Date().getFullYear(),
      data: stats
    })

  } catch (error) {
    res.status(500)
    throw new Error(`Failed to get leave balance statistics: ${error.message}`)
  }
})

/**
 * @desc    Manually adjust an employee's leave balance for a specific leave type
 * @route   POST /api/employees/:id/leave-balance/adjust
 * @access  Private/Admin/HR
 */
exports.adjustLeaveBalance = asyncHandler(async (req, res) => {
  // Only admin and HR can adjust leave balances
  if (!req.hasAnyRole(["admin", "hr", "hr_manager"])) {
    res.status(403)
    throw new Error("Not authorized to adjust leave balances")
  }

  const { id } = req.params
  const { leaveType, adjustmentType, amount, reason, year } = req.body

  if (!leaveType || !adjustmentType || !amount || !reason) {
    res.status(400)
    throw new Error("Missing required fields: leaveType, adjustmentType, amount, reason")
  }

  if (typeof amount !== 'number' || amount <= 0) {
    res.status(400)
    throw new Error("Amount must be a positive number")
  }

  if (!['add', 'reduce'].includes(adjustmentType)) {
    res.status(400)
    throw new Error("Invalid adjustmentType. Must be 'add' or 'reduce'")
  }

  // Find employee
  const employee = await db("employees")
    .where("employee_id", id)
    .orWhere("user_id", id)
    .first()

  if (!employee) {
    res.status(404)
    throw new Error("Employee not found")
  }

  try {
    const updatedBalance = await employeeLeaveBalanceService.adjustLeaveBalance({
      userId: employee.user_id,
      leaveType,
      adjustmentType,
      amount,
      reason,
      actorId: req.user.id,
      year: year ? parseInt(year) : null
    })

    res.status(200).json({
      success: true,
      message: "Leave balance adjusted successfully",
      data: updatedBalance
    })
  } catch (error) {
    res.status(500)
    throw new Error(`Failed to adjust leave balance: ${error.message}`)
  }
})
