const express = require("express")
const router = express.Router()
const {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getJobPositions,
  getLeaveTypes,
  getEmploymentTypes,
  getAllMasterData,
} = require("../controllers/masterDataController")
const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { requireRole } = require("../middlewares/rbacMiddleware")

// Get all master data at once
router.get("/all", enhancedProtect, getAllMasterData)

// Department routes
router.get("/departments", enhancedProtect, getDepartments)
router.post("/departments", enhancedProtect, requireRole("admin"), createDepartment)
router.put("/departments/:id", enhancedProtect, requireRole("admin"), updateDepartment)
router.delete("/departments/:id", enhancedProtect, requireRole("admin"), deleteDepartment)

// Job position routes
router.get("/job-positions", enhancedProtect, getJobPositions)

// Leave type routes
router.get("/leave-types", enhancedProtect, getLeaveTypes)

// Employment type routes
router.get("/employment-types", enhancedProtect, getEmploymentTypes)

module.exports = router 