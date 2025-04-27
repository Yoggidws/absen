const express = require("express")
const router = express.Router()
const {
  createSalaryRecord,
  getSalaryRecords,
  getMyCompensation,
  getSalaryRecordById,
  updateSalaryRecord,
  deleteSalaryRecord,
  getCompensationStats,
} = require("../controllers/compensationController")
const { protect, admin } = require("../middlewares/authMiddleware")

// Protected routes
router.get("/me", protect, getMyCompensation)

// Admin routes
router.post("/", protect, admin, createSalaryRecord)
router.get("/", protect, admin, getSalaryRecords)
router.get("/stats", protect, admin, getCompensationStats)
router.get("/:id", protect, admin, getSalaryRecordById)
router.put("/:id", protect, admin, updateSalaryRecord)
router.delete("/:id", protect, admin, deleteSalaryRecord)

module.exports = router
