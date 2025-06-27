const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const masterDataService = require("../services/masterDataService")

// @desc    Get all departments
// @route   GET /api/master-data/departments
// @access  Private
exports.getDepartments = asyncHandler(async (req, res) => {
  const departments = await masterDataService.getDepartments()

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

  const department = await masterDataService.createDepartment(name, description)

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
  const jobPositions = await masterDataService.getJobPositions()

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
  const leaveTypes = await masterDataService.getLeaveTypes()

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
  const employmentTypes = await masterDataService.getEmploymentTypes()

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
  const data = await masterDataService.getAllMasterData()

  res.status(200).json({
    success: true,
    data,
  })
}) 