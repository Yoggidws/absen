const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")

/**
 * @desc    Create a new salary record
 * @route   POST /api/compensation
 * @access  Private/Admin
 */
exports.createSalaryRecord = asyncHandler(async (req, res) => {
  const { userId, baseSalary, currency, effectiveDate, bonuses, deductions, notes } = req.body

  // Check if user exists
  const user = await db("users").where({ id: userId }).first()
  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Generate a unique ID for the compensation record
  const compensationId = "COMP-" + Math.random().toString(36).substring(2, 10).toUpperCase()

  // Create salary record
  const [salaryRecord] = await db("compensation")
    .insert({
      id: compensationId,
      user_id: userId,
      base_salary: baseSalary,
      currency: currency || "USD",
      effective_date: effectiveDate || new Date(),
      bonuses: bonuses ? JSON.stringify(bonuses) : null,
      deductions: deductions ? JSON.stringify(deductions) : null,
      notes: notes || null,
      created_by: req.user.id,
    })
    .returning("*")

  res.status(201).json({
    success: true,
    data: salaryRecord,
  })
})

/**
 * @desc    Get all salary records
 * @route   GET /api/compensation
 * @access  Private/Admin
 */
exports.getSalaryRecords = asyncHandler(async (req, res) => {
  const { userId } = req.query

  // Start building query
  let query = db("compensation as c")
    .join("users as u", "c.user_id", "u.id")
    .leftJoin("users as cb", "c.created_by", "cb.id")
    .select(
      "c.id",
      "c.user_id",
      "u.name as user_name",
      "u.email as user_email",
      "u.department",
      "u.position",
      "c.base_salary",
      "c.currency",
      "c.effective_date",
      "c.bonuses",
      "c.deductions",
      "c.notes",
      "c.created_at",
      "c.updated_at",
      "cb.name as created_by_name",
    )
    .orderBy("c.effective_date", "desc")

  // Filter by user ID if provided
  if (userId) {
    query = query.where("c.user_id", userId)
  }

  const salaryRecords = await query

  res.status(200).json({
    success: true,
    count: salaryRecords.length,
    data: salaryRecords,
  })
})

/**
 * @desc    Get user's own compensation
 * @route   GET /api/compensation/me
 * @access  Private
 */
exports.getMyCompensation = asyncHandler(async (req, res) => {
  const userId = req.user.id

  // Get user's latest salary record
  const latestSalary = await db("compensation").where({ user_id: userId }).orderBy("effective_date", "desc").first()

  if (!latestSalary) {
    return res.status(200).json({
      success: true,
      data: null,
      message: "No compensation record found",
    })
  }

  // Get user's salary history
  const salaryHistory = await db("compensation")
    .where({ user_id: userId })
    .select("id", "base_salary", "currency", "effective_date", "bonuses", "deductions", "notes", "created_at")
    .orderBy("effective_date", "desc")

  // Calculate total compensation
  let totalCompensation = latestSalary.base_salary

  // Add bonuses
  if (latestSalary.bonuses) {
    const bonuses = JSON.parse(latestSalary.bonuses)
    if (Array.isArray(bonuses)) {
      totalCompensation += bonuses.reduce((sum, bonus) => sum + (Number.parseFloat(bonus.amount) || 0), 0)
    }
  }

  // Subtract deductions
  if (latestSalary.deductions) {
    const deductions = JSON.parse(latestSalary.deductions)
    if (Array.isArray(deductions)) {
      totalCompensation -= deductions.reduce((sum, deduction) => sum + (Number.parseFloat(deduction.amount) || 0), 0)
    }
  }

  res.status(200).json({
    success: true,
    data: {
      current: {
        ...latestSalary,
        total_compensation: totalCompensation,
      },
      history: salaryHistory,
    },
  })
})

/**
 * @desc    Get salary record by ID
 * @route   GET /api/compensation/:id
 * @access  Private/Admin
 */
exports.getSalaryRecordById = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Get salary record with user information
  const salaryRecord = await db("compensation as c")
    .join("users as u", "c.user_id", "u.id")
    .leftJoin("users as cb", "c.created_by", "cb.id")
    .select(
      "c.id",
      "c.user_id",
      "u.name as user_name",
      "u.email as user_email",
      "u.department",
      "u.position",
      "c.base_salary",
      "c.currency",
      "c.effective_date",
      "c.bonuses",
      "c.deductions",
      "c.notes",
      "c.created_at",
      "c.updated_at",
      "cb.name as created_by_name",
    )
    .where("c.id", id)
    .first()

  if (!salaryRecord) {
    res.status(404)
    throw new Error("Salary record not found")
  }

  res.status(200).json({
    success: true,
    data: salaryRecord,
  })
})

/**
 * @desc    Update salary record
 * @route   PUT /api/compensation/:id
 * @access  Private/Admin
 */
exports.updateSalaryRecord = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { baseSalary, currency, effectiveDate, bonuses, deductions, notes } = req.body

  // Check if salary record exists
  const salaryRecord = await db("compensation").where({ id }).first()
  if (!salaryRecord) {
    res.status(404)
    throw new Error("Salary record not found")
  }

  // Update salary record
  const [updatedSalaryRecord] = await db("compensation")
    .where({ id })
    .update({
      base_salary: baseSalary || salaryRecord.base_salary,
      currency: currency || salaryRecord.currency,
      effective_date: effectiveDate || salaryRecord.effective_date,
      bonuses: bonuses ? JSON.stringify(bonuses) : salaryRecord.bonuses,
      deductions: deductions ? JSON.stringify(deductions) : salaryRecord.deductions,
      notes: notes !== undefined ? notes : salaryRecord.notes,
      updated_at: db.fn.now(),
    })
    .returning("*")

  res.status(200).json({
    success: true,
    data: updatedSalaryRecord,
  })
})

/**
 * @desc    Delete salary record
 * @route   DELETE /api/compensation/:id
 * @access  Private/Admin
 */
exports.deleteSalaryRecord = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Check if salary record exists
  const salaryRecord = await db("compensation").where({ id }).first()
  if (!salaryRecord) {
    res.status(404)
    throw new Error("Salary record not found")
  }

  // Delete salary record
  await db("compensation").where({ id }).delete()

  res.status(200).json({
    success: true,
    message: "Salary record deleted successfully",
  })
})

/**
 * @desc    Get compensation statistics
 * @route   GET /api/compensation/stats
 * @access  Private/Admin
 */
exports.getCompensationStats = asyncHandler(async (req, res) => {
  // Get average salary by department
  const departmentStats = await db("compensation as c")
    .join("users as u", "c.user_id", "u.id")
    .select("u.department")
    .avg("c.base_salary as average_salary")
    .whereNotNull("u.department")
    .groupBy("u.department")
    .orderBy("average_salary", "desc")

  // Get average salary by position
  const positionStats = await db("compensation as c")
    .join("users as u", "c.user_id", "u.id")
    .select("u.position")
    .avg("c.base_salary as average_salary")
    .whereNotNull("u.position")
    .groupBy("u.position")
    .orderBy("average_salary", "desc")
    .limit(10)

  // Get overall statistics
  const { avg_salary } = await db("compensation").avg("base_salary as avg_salary").first()

  const { min_salary } = await db("compensation").min("base_salary as min_salary").first()

  const { max_salary } = await db("compensation").max("base_salary as max_salary").first()

  const { total_compensation } = await db("compensation").sum("base_salary as total_compensation").first()

  res.status(200).json({
    success: true,
    stats: {
      overall: {
        average_salary: Number.parseFloat(avg_salary),
        minimum_salary: Number.parseFloat(min_salary),
        maximum_salary: Number.parseFloat(max_salary),
        total_compensation: Number.parseFloat(total_compensation),
      },
      by_department: departmentStats,
      by_position: positionStats,
    },
  })
})
