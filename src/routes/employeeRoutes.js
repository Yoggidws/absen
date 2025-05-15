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

module.exports = router
