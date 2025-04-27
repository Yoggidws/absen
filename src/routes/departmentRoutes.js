const express = require("express")
const router = express.Router()
const {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  getDepartmentStats,
} = require("../controllers/departmentController")
const { protect, admin } = require("../middlewares/authMiddleware")

// Protected routes
router.get("/", protect, getAllDepartments)
router.get("/stats", protect, admin, getDepartmentStats)
router.get("/:id", protect, getDepartmentById)

// Admin routes
router.post("/", protect, admin, createDepartment)
router.put("/:id", protect, admin, updateDepartment)
router.delete("/:id", protect, admin, deleteDepartment)

module.exports = router
