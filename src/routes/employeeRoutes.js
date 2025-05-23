const express = require("express")
const router = express.Router()
const { protect, admin } = require("../middlewares/authMiddleware")
const {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeStatistics,
  startOnboarding,
  startOffboarding,
  getOnboardingTasks,
  getOffboardingTasks,
  updateTaskStatus,
} = require("../controllers/employeeController")

// Routes
router.route("/")
  .get(protect, admin, getAllEmployees)
  .post(protect, admin, createEmployee)

router.route("/stats")
  .get(protect, admin, getEmployeeStatistics)

router.route("/:id")
  .get(protect, admin, getEmployeeById)
  .put(protect, admin, updateEmployee)
  .delete(protect, admin, deleteEmployee)

// Onboarding routes
router.post("/:id/onboarding/start", protect, admin, startOnboarding)
router.get("/onboarding/tasks", protect, admin, getOnboardingTasks)

// Offboarding routes
router.post("/:id/offboarding/start", protect, admin, startOffboarding)
router.get("/offboarding/tasks", protect, admin, getOffboardingTasks)

// Task management
router.put("/:type/tasks/:id", protect, admin, updateTaskStatus)

module.exports = router
