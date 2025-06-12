const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")

// @desc    Get all departments
// @route   GET /api/master-data/departments
// @access  Private
exports.getDepartments = asyncHandler(async (req, res) => {
  const departments = await db("departments")
    .select("id", "name", "description", "created_at", "updated_at")
    .orderBy("name", "asc")

  res.status(200).json({
    success: true,
    count: departments.length,
    data: departments,
  })
})

// @desc    Create department
// @route   POST /api/master-data/departments
// @access  Private/Admin
exports.createDepartment = asyncHandler(async (req, res) => {
  const { name, description } = req.body

  if (!name) {
    res.status(400)
    throw new Error("Department name is required")
  }

  // Check if department already exists
  const existingDepartment = await db("departments").where({ name }).first()
  if (existingDepartment) {
    res.status(400)
    throw new Error("Department with this name already exists")
  }

  // Generate department ID
  const result = await db.raw(`SELECT id FROM departments WHERE id::TEXT LIKE 'dept%' ORDER BY id DESC LIMIT 1`)
  let newId
  if (result.rows.length === 0) {
    newId = 'dept001'
  } else {
    const lastId = result.rows[0].id
    const numericPart = lastId.replace('dept', '')
    const nextNum = (parseInt(numericPart) + 1).toString().padStart(3, '0')
    newId = `dept${nextNum}`
  }

  const [department] = await db("departments")
    .insert({
      id: newId,
      name,
      description: description || "",
    })
    .returning("*")

  res.status(201).json({
    success: true,
    data: department,
  })
})

// @desc    Update department
// @route   PUT /api/master-data/departments/:id
// @access  Private/Admin
exports.updateDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, description } = req.body

  const department = await db("departments").where({ id }).first()
  if (!department) {
    res.status(404)
    throw new Error("Department not found")
  }

  // Check if name conflicts with existing department
  if (name && name !== department.name) {
    const existingDepartment = await db("departments").where({ name }).first()
    if (existingDepartment) {
      res.status(400)
      throw new Error("Department with this name already exists")
    }
  }

  const [updatedDepartment] = await db("departments")
    .where({ id })
    .update({
      name: name || department.name,
      description: description !== undefined ? description : department.description,
      updated_at: new Date(),
    })
    .returning("*")

  res.status(200).json({
    success: true,
    data: updatedDepartment,
  })
})

// @desc    Delete department
// @route   DELETE /api/master-data/departments/:id
// @access  Private/Admin
exports.deleteDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params

  const department = await db("departments").where({ id }).first()
  if (!department) {
    res.status(404)
    throw new Error("Department not found")
  }

  // Check if department has employees
  const employeeCount = await db("employees").where({ department: department.name }).count("* as count").first()
  if (parseInt(employeeCount.count) > 0) {
    res.status(400)
    throw new Error("Cannot delete department with existing employees")
  }

  await db("departments").where({ id }).del()

  res.status(200).json({
    success: true,
    message: "Department deleted successfully",
  })
})

// @desc    Get all job positions
// @route   GET /api/master-data/job-positions
// @access  Private
exports.getJobPositions = asyncHandler(async (req, res) => {
  // For now, return static data since we don't have a job_positions table
  const jobPositions = [
    { id: 1, name: "CEO", code: "CEO", description: "Chief Executive Officer" },
    { id: 2, name: "CTO", code: "CTO", description: "Chief Technology Officer" },
    { id: 3, name: "CFO", code: "CFO", description: "Chief Financial Officer" },
    { id: 4, name: "HR Director", code: "HRD", description: "Human Resources Director" },
    { id: 5, name: "Marketing Director", code: "MKD", description: "Marketing Director" },
    { id: 6, name: "Senior Developer", code: "SDEV", description: "Senior Software Developer" },
    { id: 7, name: "Junior Developer", code: "JDEV", description: "Junior Software Developer" },
    { id: 8, name: "Financial Analyst", code: "FANA", description: "Financial Analyst" },
    { id: 9, name: "HR Specialist", code: "HRSP", description: "Human Resources Specialist" },
    { id: 10, name: "Sales Representative", code: "SREP", description: "Sales Representative" },
    { id: 11, name: "Product Manager", code: "PM", description: "Product Manager" },
    { id: 12, name: "UX Designer", code: "UXD", description: "User Experience Designer" },
    { id: 13, name: "Software Engineer", code: "SE", description: "Software Engineer" },
    { id: 14, name: "Marketing Specialist", code: "MS", description: "Marketing Specialist" },
    { id: 15, name: "Customer Support", code: "CS", description: "Customer Support Representative" },
  ]

  res.status(200).json({
    success: true,
    count: jobPositions.length,
    data: jobPositions,
  })
})

// @desc    Get all leave types
// @route   GET /api/master-data/leave-types
// @access  Private
exports.getLeaveTypes = asyncHandler(async (req, res) => {
  const leaveTypes = [
    { id: 1, name: "Annual Leave", code: "AL", description: "Regular vacation leave", max_days: 20 },
    { id: 2, name: "Sick Leave", code: "SL", description: "Leave due to illness", max_days: 10 },
    { id: 3, name: "Maternity Leave", code: "ML", description: "Leave for childbirth and care", max_days: 90 },
    { id: 4, name: "Paternity Leave", code: "PL", description: "Leave for fathers after childbirth", max_days: 14 },
    { id: 5, name: "Bereavement Leave", code: "BL", description: "Leave due to death of family member", max_days: 2 },
    { id: 6, name: "Marriage Leave", code: "MAL", description: "Leave for marriage", max_days: 3 },
    { id: 7, name: "Hajj/Umrah Leave", code: "HUL", description: "Leave for religious pilgrimage", max_days: 30 },
    { id: 8, name: "Long Leave", code: "LL", description: "Extended leave for personal reasons", max_days: 90 },
  ]

  res.status(200).json({
    success: true,
    count: leaveTypes.length,
    data: leaveTypes,
  })
})

// @desc    Get all employment types
// @route   GET /api/master-data/employment-types
// @access  Private
exports.getEmploymentTypes = asyncHandler(async (req, res) => {
  const employmentTypes = [
    { id: 1, name: "Permanent", code: "PERM", description: "Regular full-time permanent employment" },
    { id: 2, name: "Contract", code: "CONT", description: "Fixed-term contract employment" },
    { id: 3, name: "Part-time", code: "PT", description: "Regular part-time employment" },
    { id: 4, name: "Temporary", code: "TEMP", description: "Temporary employment" },
    { id: 5, name: "Internship", code: "INT", description: "Internship position" },
    { id: 6, name: "Freelance", code: "FL", description: "Freelance work arrangement" },
    { id: 7, name: "Probation", code: "PROB", description: "Employee on probation period" },
  ]

  res.status(200).json({
    success: true,
    count: employmentTypes.length,
    data: employmentTypes,
  })
})

// @desc    Get all master data
// @route   GET /api/master-data/all
// @access  Private
exports.getAllMasterData = asyncHandler(async (req, res) => {
  const [departments, jobPositions, leaveTypes, employmentTypes] = await Promise.all([
    db("departments").select("id", "name", "description").orderBy("name", "asc"),
    // Job positions - fetch from database
    db("job_positions")
      .select("id", "name", "code", "description", "level", "department", "min_salary", "max_salary")
      .where("active", true)
      .orderBy("level", "asc")
      .orderBy("name", "asc"),
    // Leave types - derived from database enum and leave_balance table structure
    Promise.resolve([
      { id: 1, name: "Annual Leave", code: "annual", description: "Regular vacation leave", max_days: 20 },
      { id: 2, name: "Sick Leave", code: "sick", description: "Leave due to illness", max_days: 10 },
      { id: 3, name: "Long Leave", code: "long", description: "Extended leave for special circumstances", max_days: 90 },
      { id: 4, name: "Maternity Leave", code: "maternity", description: "Leave for childbirth and care", max_days: 90 },
      { id: 5, name: "Paternity Leave", code: "paternity", description: "Leave for fathers after childbirth", max_days: 14 },
      { id: 6, name: "Marriage Leave", code: "marriage", description: "Leave for marriage", max_days: 3 },
      { id: 7, name: "Death Leave", code: "death", description: "Leave due to death of family member", max_days: 2 },
      { id: 8, name: "Hajj/Umrah Leave", code: "hajj_umrah", description: "Leave for religious pilgrimage", max_days: 30 },
    ]),
    // Employment types - static data for now
    Promise.resolve([
      { id: 1, name: "Permanent", code: "permanent", description: "Regular full-time permanent employment" },
      { id: 2, name: "Contract", code: "contract", description: "Fixed-term contract employment" },
      { id: 3, name: "Probation", code: "probation", description: "Probationary employment period" },
      { id: 4, name: "Intern", code: "intern", description: "Internship position" },
    ])
  ])

  res.status(200).json({
    success: true,
    data: {
      departments,
      jobPositions,
      leaveTypes,
      employmentTypes,
    },
  })
}) 