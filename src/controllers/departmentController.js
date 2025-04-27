const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const { generateId } = require("../utils/idGenerator")

/**
 * Generate a unique department ID with dept prefix
 * @returns {Promise<string>} The generated ID
 */
async function generateDepartmentId() {
  // Get the latest department ID with dept prefix
  const result = await db.raw(`SELECT id FROM departments WHERE id::TEXT LIKE 'dept%' ORDER BY id DESC LIMIT 1`)

  let newId
  if (result.rows.length === 0) {
    newId = 'dept001' // If no departments exist, start from 001
  } else {
    // Extract the numeric part and increment
    const lastId = result.rows[0].id
    const numericPart = lastId.replace('dept', '')
    const nextNum = (parseInt(numericPart) + 1).toString().padStart(3, '0')
    newId = `dept${nextNum}`
  }

  return newId
}

/**
 * @desc    Create a new department
 * @route   POST /api/departments
 * @access  Private/Admin
 */
exports.createDepartment = asyncHandler(async (req, res) => {
  const { name, description, managerId } = req.body

  // Check if department with the same name already exists
  const existingDepartment = await db("departments").where({ name }).first()
  if (existingDepartment) {
    res.status(400)
    throw new Error("Department with this name already exists")
  }

  // If manager ID is provided, check if user exists and is a manager
  if (managerId) {
    const manager = await db("users").where({ id: managerId }).first()
    if (!manager) {
      res.status(404)
      throw new Error("Manager not found")
    }

    if (manager.role !== "manager" && manager.role !== "admin") {
      res.status(400)
      throw new Error("Selected user must have a manager or admin role")
    }
  }

  // Generate a unique ID for the department
  const departmentId = await generateDepartmentId()

  // Create department
  const [department] = await db("departments")
    .insert({
      id: departmentId,
      name,
      description,
      manager_id: managerId || null,
    })
    .returning("*")

  res.status(201).json({
    success: true,
    data: department,
  })
})

/**
 * @desc    Get all departments
 * @route   GET /api/departments
 * @access  Private
 */
exports.getAllDepartments = asyncHandler(async (req, res) => {
  // Get all departments with manager information
  const departments = await db("departments as d")
    .leftJoin("users as u", "d.manager_id", "u.id")
    .select(
      "d.id",
      "d.name",
      "d.description",
      "d.created_at",
      "d.updated_at",
      "d.manager_id",
      "u.name as manager_name",
      "u.email as manager_email",
    )
    .orderBy("d.name", "asc")

  // Get employee count for each department
  const departmentsWithCounts = await Promise.all(
    departments.map(async (dept) => {
      const { count } = await db("users").where({ department: dept.name }).count("id as count").first()

      return {
        ...dept,
        employee_count: Number.parseInt(count, 10),
      }
    }),
  )

  res.status(200).json({
    success: true,
    count: departmentsWithCounts.length,
    data: departmentsWithCounts,
  })
})

/**
 * @desc    Get department by ID
 * @route   GET /api/departments/:id
 * @access  Private
 */
exports.getDepartmentById = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Get department with manager information
  const department = await db("departments as d")
    .leftJoin("users as u", "d.manager_id", "u.id")
    .select(
      "d.id",
      "d.name",
      "d.description",
      "d.created_at",
      "d.updated_at",
      "d.manager_id",
      "u.name as manager_name",
      "u.email as manager_email",
    )
    .where("d.id", id)
    .first()

  if (!department) {
    res.status(404)
    throw new Error("Department not found")
  }

  // Get employees in this department
  const employees = await db("users")
    .where({ department: department.name })
    .select("id", "name", "email", "position", "role", "avatar", "active")
    .orderBy("name", "asc")

  // Add employee count
  department.employee_count = employees.length
  department.employees = employees

  res.status(200).json({
    success: true,
    data: department,
  })
})

/**
 * @desc    Update department
 * @route   PUT /api/departments/:id
 * @access  Private/Admin
 */
exports.updateDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, description, managerId } = req.body

  // Check if department exists
  const department = await db("departments").where({ id }).first()
  if (!department) {
    res.status(404)
    throw new Error("Department not found")
  }

  // If name is being changed, check if it conflicts with existing department
  if (name && name !== department.name) {
    const existingDepartment = await db("departments").where({ name }).first()
    if (existingDepartment) {
      res.status(400)
      throw new Error("Department with this name already exists")
    }
  }

  // If manager ID is provided, check if user exists and is a manager
  if (managerId) {
    const manager = await db("users").where({ id: managerId }).first()
    if (!manager) {
      res.status(404)
      throw new Error("Manager not found")
    }

    if (manager.role !== "manager" && manager.role !== "admin") {
      res.status(400)
      throw new Error("Selected user must have a manager or admin role")
    }
  }

  // Update department
  const [updatedDepartment] = await db("departments")
    .where({ id })
    .update({
      name: name || department.name,
      description: description !== undefined ? description : department.description,
      manager_id: managerId !== undefined ? managerId : department.manager_id,
      updated_at: db.fn.now(),
    })
    .returning("*")

  // If department name changed, update all users with the old department name
  if (name && name !== department.name) {
    await db("users").where({ department: department.name }).update({ department: name })
  }

  res.status(200).json({
    success: true,
    data: updatedDepartment,
  })
})

/**
 * @desc    Delete department
 * @route   DELETE /api/departments/:id
 * @access  Private/Admin
 */
exports.deleteDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Check if department exists
  const department = await db("departments").where({ id }).first()
  if (!department) {
    res.status(404)
    throw new Error("Department not found")
  }

  // Check if department has employees
  const { count } = await db("users").where({ department: department.name }).count("id as count").first()

  if (Number.parseInt(count, 10) > 0) {
    res.status(400)
    throw new Error("Cannot delete department with employees. Reassign employees first.")
  }

  // Delete department
  await db("departments").where({ id }).delete()

  res.status(200).json({
    success: true,
    message: "Department deleted successfully",
  })
})

/**
 * @desc    Get department statistics
 * @route   GET /api/departments/stats
 * @access  Private/Admin
 */
exports.getDepartmentStats = asyncHandler(async (req, res) => {
  // Get all departments with counts
  const departments = await db("departments").select("name")

  // Get statistics for each department
  const departmentStats = await Promise.all(
    departments.map(async (dept) => {
      // Get employee count
      const { total } = await db("users").where({ department: dept.name }).count("id as total").first()

      // Get active employee count
      const { active } = await db("users").where({ department: dept.name, active: true }).count("id as active").first()

      // Get role distribution
      const roleDistribution = await db("users")
        .where({ department: dept.name })
        .select("role")
        .count("id as count")
        .groupBy("role")

      return {
        name: dept.name,
        total_employees: Number.parseInt(total, 10),
        active_employees: Number.parseInt(active, 10),
        inactive_employees: Number.parseInt(total, 10) - Number.parseInt(active, 10),
        role_distribution: roleDistribution.reduce((acc, role) => {
          acc[role.role] = Number.parseInt(role.count, 10)
          return acc
        }, {}),
      }
    }),
  )

  // Get overall statistics
  const { total_employees } = await db("users").count("id as total_employees").first()

  const { active_employees } = await db("users").where({ active: true }).count("id as active_employees").first()

  const overall = {
    total_employees: Number.parseInt(total_employees, 10),
    active_employees: Number.parseInt(active_employees, 10),
    inactive_employees: Number.parseInt(total_employees, 10) - Number.parseInt(active_employees, 10),
    department_count: departments.length,
  }

  res.status(200).json({
    success: true,
    overall,
    departments: departmentStats,
  })
})
