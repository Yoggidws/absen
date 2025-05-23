const asyncHandler = require("express-async-handler")
const { db } = require("../config/db")
const Employee = require("../models/Employee")

/**
 * @desc    Get all employees
 * @route   GET /api/employees
 * @access  Private/Admin
 */
exports.getAllEmployees = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1
  const limit = parseInt(req.query.limit, 10) || 10
  const filters = {
    department_id: req.query.department,
    employment_status: req.query.status,
    search: req.query.search,
  }

  const employees = await Employee.getAll(filters, page, limit)

  res.status(200).json({
    success: true,
    ...employees,
  })
})

/**
 * @desc    Get employee by ID
 * @route   GET /api/employees/:id
 * @access  Private/Admin
 */
exports.getEmployeeById = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id)

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
 * @desc    Create a new employee
 * @route   POST /api/employees
 * @access  Private/Admin
 */
exports.createEmployee = asyncHandler(async (req, res) => {
  const {
    full_name,
    gender,
    place_of_birth,
    date_of_birth,
    address,
    phone_number,
    email,
    marital_status,
    number_of_children,
    position,
    department,
    department_id,
    hire_date,
    employment_status,
    basic_salary,
    allowance,
    profile_picture,
    user_id,
  } = req.body

  // Check if employee with this email already exists
  const existingEmployeeByEmail = await Employee.findByEmail(email)
  if (existingEmployeeByEmail) {
    res.status(400)
    throw new Error("Employee with this email already exists")
  }

  // Check if user exists if user_id is provided
  if (user_id) {
    const user = await db("users").where({ id: user_id }).first()
    if (!user) {
      res.status(404)
      throw new Error("User not found")
    }

    // Check if user is already linked to an employee
    const existingEmployeeByUserId = await Employee.findByUserId(user_id)
    if (existingEmployeeByUserId) {
      res.status(400)
      throw new Error("This user is already linked to an employee")
    }
  }

  // Check if department exists if department_id is provided
  if (department_id) {
    const departmentExists = await db("departments").where({ id: department_id }).first()
    if (!departmentExists) {
      res.status(404)
      throw new Error("Department not found")
    }
  }

  // Create employee
  const employee = await Employee.create({
    full_name,
    gender,
    place_of_birth,
    date_of_birth,
    address,
    phone_number,
    email,
    marital_status,
    number_of_children,
    position,
    department,
    department_id,
    hire_date,
    employment_status,
    basic_salary,
    allowance,
    profile_picture,
    user_id,
    employee_id: user_id, // Use user_id as employee_id
  })

  res.status(201).json({
    success: true,
    data: employee,
  })
})

/**
 * @desc    Update employee
 * @route   PUT /api/employees/:id
 * @access  Private/Admin
 */
exports.updateEmployee = asyncHandler(async (req, res) => {
  const {
    full_name,
    gender,
    place_of_birth,
    date_of_birth,
    address,
    phone_number,
    email,
    marital_status,
    number_of_children,
    position,
    department,
    department_id,
    hire_date,
    employment_status,
    basic_salary,
    allowance,
    profile_picture,
    user_id,
  } = req.body

  // Check if employee exists
  const employee = await Employee.findById(req.params.id)
  if (!employee) {
    res.status(404)
    throw new Error("Employee not found")
  }

  // Check if email is unique if changed
  if (email && email !== employee.email) {
    const existingEmployeeByEmail = await Employee.findByEmail(email)
    if (existingEmployeeByEmail && existingEmployeeByEmail.employee_id !== employee.employee_id) {
      res.status(400)
      throw new Error("Employee with this email already exists")
    }
  }

  // Check if user exists if user_id is changed
  if (user_id && user_id !== employee.user_id) {
    const user = await db("users").where({ id: user_id }).first()
    if (!user) {
      res.status(404)
      throw new Error("User not found")
    }

    // Check if user is already linked to another employee
    const existingEmployeeByUserId = await Employee.findByUserId(user_id)
    if (existingEmployeeByUserId && existingEmployeeByUserId.employee_id !== employee.employee_id) {
      res.status(400)
      throw new Error("This user is already linked to another employee")
    }
  }

  // Check if department exists if department_id is changed
  if (department_id && department_id !== employee.department_id) {
    const departmentExists = await db("departments").where({ id: department_id }).first()
    if (!departmentExists) {
      res.status(404)
      throw new Error("Department not found")
    }
  }

  // Update employee
  const updatedEmployee = await Employee.update(req.params.id, {
    full_name: full_name || employee.full_name,
    gender: gender || employee.gender,
    place_of_birth: place_of_birth || employee.place_of_birth,
    date_of_birth: date_of_birth || employee.date_of_birth,
    address: address || employee.address,
    phone_number: phone_number || employee.phone_number,
    email: email || employee.email,
    marital_status: marital_status || employee.marital_status,
    number_of_children: number_of_children !== undefined ? number_of_children : employee.number_of_children,
    position: position || employee.position,
    department: department || employee.department,
    department_id: department_id || employee.department_id,
    hire_date: hire_date || employee.hire_date,
    employment_status: employment_status || employee.employment_status,
    basic_salary: basic_salary !== undefined ? basic_salary : employee.basic_salary,
    allowance: allowance !== undefined ? allowance : employee.allowance,
    profile_picture: profile_picture || employee.profile_picture,
    user_id: user_id || employee.user_id,
  })

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
  // Check if employee exists
  const employee = await Employee.findById(req.params.id)
  if (!employee) {
    res.status(404)
    throw new Error("Employee not found")
  }

  // Delete employee
  await Employee.delete(req.params.id)

  res.status(200).json({
    success: true,
    message: "Employee deleted successfully",
  })
})

/**
 * @desc    Get employee statistics
 * @route   GET /api/employees/stats
 * @access  Private/Admin
 */
exports.getEmployeeStatistics = asyncHandler(async (_req, res) => {
  const stats = await Employee.getStatistics()

  res.status(200).json({
    success: true,
    data: stats,
  })
})

/**
 * @desc    Start onboarding process for an employee
 * @route   POST /api/employees/:id/onboarding/start
 * @access  Private/Admin
 */
exports.startOnboarding = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id)
  if (!employee) {
    res.status(404)
    throw new Error("Employee not found")
  }

  // Default onboarding tasks
  const onboardingTasks = [
    {
      task_name: "Prepare workstation",
      description: "Set up computer, software, and necessary equipment",
      assigned_to: req.user.id,
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
    {
      task_name: "Create email account",
      description: "Set up corporate email and communication tools",
      assigned_to: req.user.id,
      due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    },
    {
      task_name: "Schedule orientation",
      description: "Plan and conduct company orientation session",
      assigned_to: req.user.id,
      due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
    },
    {
      task_name: "Assign mentor",
      description: "Select and assign an experienced employee as mentor",
      assigned_to: req.user.id,
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
    {
      task_name: "Complete paperwork",
      description: "Process all necessary employment documents",
      assigned_to: req.user.id,
      due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
    },
  ]

  // Create tasks in database
  await db.transaction(async (trx) => {
    for (const task of onboardingTasks) {
      await trx("onboarding_tasks").insert({
        id: generateId(),
        employee_id: employee.employee_id,
        task_name: task.task_name,
        description: task.description,
        status: "pending",
        assigned_to: task.assigned_to,
        due_date: task.due_date,
      })
    }
  })

  res.status(200).json({
    success: true,
    message: "Onboarding process started successfully",
  })
})

/**
 * @desc    Start offboarding process for an employee
 * @route   POST /api/employees/:id/offboarding/start
 * @access  Private/Admin
 */
exports.startOffboarding = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id)
  if (!employee) {
    res.status(404)
    throw new Error("Employee not found")
  }

  // Default offboarding tasks
  const offboardingTasks = [
    {
      task_name: "Collect company property",
      description: "Retrieve laptop, access cards, and other company assets",
      assigned_to: req.user.id,
      due_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
    },
    {
      task_name: "Disable system access",
      description: "Revoke access to all company systems and applications",
      assigned_to: req.user.id,
      due_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
    },
    {
      task_name: "Conduct exit interview",
      description: "Schedule and complete exit interview",
      assigned_to: req.user.id,
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
    {
      task_name: "Process final paycheck",
      description: "Calculate and process final payment including any outstanding benefits",
      assigned_to: req.user.id,
      due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
    },
    {
      task_name: "Revoke building access",
      description: "Deactivate physical access to company premises",
      assigned_to: req.user.id,
      due_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
    },
  ]

  // Create tasks in database
  await db.transaction(async (trx) => {
    for (const task of offboardingTasks) {
      await trx("offboarding_tasks").insert({
        id: generateId(),
        employee_id: employee.employee_id,
        task_name: task.task_name,
        description: task.description,
        status: "pending",
        assigned_to: task.assigned_to,
        due_date: task.due_date,
      })
    }

    // Update employee status
    await trx("employees")
      .where({ employee_id: employee.employee_id })
      .update({
        employment_status: "terminated",
        updated_at: new Date(),
      })
  })

  res.status(200).json({
    success: true,
    message: "Offboarding process started successfully",
  })
})

/**
 * @desc    Get onboarding tasks
 * @route   GET /api/employees/onboarding/tasks
 * @access  Private/Admin
 */
exports.getOnboardingTasks = asyncHandler(async (req, res) => {
  const tasks = await db("onboarding_tasks as ot")
    .join("employees as e", "ot.employee_id", "e.employee_id")
    .join("users as u", "ot.assigned_to", "u.id")
    .select(
      "ot.*",
      "e.full_name as employee_name",
      "e.department",
      "u.name as assigned_to_name"
    )
    .orderBy(["ot.employee_id", "ot.created_at"])

  res.status(200).json({
    success: true,
    data: tasks,
  })
})

/**
 * @desc    Get offboarding tasks
 * @route   GET /api/employees/offboarding/tasks
 * @access  Private/Admin
 */
exports.getOffboardingTasks = asyncHandler(async (req, res) => {
  const tasks = await db("offboarding_tasks as ot")
    .join("employees as e", "ot.employee_id", "e.employee_id")
    .join("users as u", "ot.assigned_to", "u.id")
    .select(
      "ot.*",
      "e.full_name as employee_name",
      "e.department",
      "u.name as assigned_to_name"
    )
    .orderBy(["ot.employee_id", "ot.created_at"])

  res.status(200).json({
    success: true,
    data: tasks,
  })
})

/**
 * @desc    Update task status
 * @route   PUT /api/employees/:type/tasks/:id
 * @access  Private/Admin
 */
exports.updateTaskStatus = asyncHandler(async (req, res) => {
  const { type, id } = req.params
  const { status, notes } = req.body

  if (!["onboarding", "offboarding"].includes(type)) {
    res.status(400)
    throw new Error("Invalid task type")
  }

  if (!["pending", "in_progress", "completed"].includes(status)) {
    res.status(400)
    throw new Error("Invalid status")
  }

  const tableName = `${type}_tasks`
  const task = await db(tableName).where({ id }).first()

  if (!task) {
    res.status(404)
    throw new Error("Task not found")
  }

  await db(tableName)
    .where({ id })
    .update({
      status,
      notes,
      updated_at: new Date(),
    })

  res.status(200).json({
    success: true,
    message: "Task status updated successfully",
  })
})
