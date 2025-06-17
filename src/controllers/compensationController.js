const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")

/**
 * @desc    Create a new salary record
 * @route   POST /api/compensation
 * @access  Private/Admin
 */
exports.createSalaryRecord = asyncHandler(async (req, res) => {
  const { userId, baseSalary, mealAllowance, effectiveDate, notes } = req.body

  // Check if user exists
  const user = await db("users").where({ id: userId }).first()
  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Check if user already has a compensation record
  const existingCompensation = await db("compensation").where({ user_id: userId }).first()
  if (existingCompensation) {
    res.status(400)
    throw new Error(`User ${user.name} already has a compensation record. Please edit the existing record instead.`)
  }

  // Generate a unique ID for the compensation record
  const compensationId = "COMP-" + Math.random().toString(36).substring(2, 10).toUpperCase()

  // Create salary record
  const [salaryRecord] = await db("compensation")
    .insert({
      id: compensationId,
      user_id: userId,
      base_salary: baseSalary,
      meal_allowance: mealAllowance || 0,
      effective_date: effectiveDate || new Date(),
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

  try {
    // Start building query with timeout protection
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
        "c.meal_allowance",
        "c.effective_date",
        "c.notes",
        "c.created_at",
        "c.updated_at",
        "cb.name as created_by_name",
      )
      .orderBy("c.effective_date", "desc")
      .timeout(10000) // 10 second timeout

    // Filter by user ID if provided
    if (userId) {
      query = query.where("c.user_id", userId)
    }

    // Execute query with additional timeout protection
    const salaryRecords = await Promise.race([
      query,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Compensation query timeout')), 12000)
      )
    ]);

    res.status(200).json({
      success: true,
      count: salaryRecords.length,
      data: salaryRecords,
    })

  } catch (error) {
    console.error('Error in getSalaryRecords:', error.message);
    
    // If timeout or connection error, return cached or minimal data
    if (error.message.includes('timeout') || error.message.includes('connection')) {
      console.warn('Database timeout in compensation query, returning minimal response');
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        message: 'Service temporarily unavailable, please try again'
      });
    }
    
    // Re-throw other errors
    throw error;
  }
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
    .select("id", "base_salary", "meal_allowance", "effective_date", "notes", "created_at")
    .orderBy("effective_date", "desc")

  // Calculate total compensation
  let totalCompensation = latestSalary.base_salary +
                          (latestSalary.meal_allowance || 0)

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
      "c.meal_allowance",
      "c.effective_date",
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
  const { baseSalary, mealAllowance, effectiveDate, notes } = req.body

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
      meal_allowance: mealAllowance !== undefined ? mealAllowance : salaryRecord.meal_allowance,
      effective_date: effectiveDate || salaryRecord.effective_date,
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

  const { avg_meal_allowance } = await db("compensation").avg("meal_allowance as avg_meal_allowance").first()

  const { min_salary } = await db("compensation").min("base_salary as min_salary").first()

  const { max_salary } = await db("compensation").max("base_salary as max_salary").first()

  // Calculate total compensation including all components
  const totalCompensationResult = await db.raw(`
    SELECT SUM(base_salary + COALESCE(meal_allowance, 0)) as total_compensation
    FROM compensation
  `)

  const total_compensation = totalCompensationResult.rows[0].total_compensation

  res.status(200).json({
    success: true,
    stats: {
      overall: {
        average_salary: Number.parseFloat(avg_salary),
        average_meal_allowance: Number.parseFloat(avg_meal_allowance),
        minimum_salary: Number.parseFloat(min_salary),
        maximum_salary: Number.parseFloat(max_salary),
        total_compensation: Number.parseFloat(total_compensation),
      },
      by_department: departmentStats,
      by_position: positionStats,
    },
  })
})
