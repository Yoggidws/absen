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
const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")

// Routes for managing all compensation records (HR/Admin)
router
  .route("/")
  .post(enhancedProtect, rbac.can("create:compensation"), createSalaryRecord)
  .get(enhancedProtect, rbac.can("read:compensation:all"), getSalaryRecords)

// Route for employees to view their own compensation
router
  .route("/me")
  .get(enhancedProtect, rbac.can("read:compensation:own"), getMyCompensation)

// Route for compensation statistics (HR/Admin)
router
    .route("/stats")
    .get(enhancedProtect, rbac.can("read:compensation:all"), getCompensationStats)

// Routes for specific compensation records (HR/Admin)
router
  .route("/:id")
  .get(enhancedProtect, rbac.can("read:compensation:all"), getSalaryRecordById)
  .put(enhancedProtect, rbac.can("update:compensation"), updateSalaryRecord)
  .delete(enhancedProtect, rbac.can("delete:compensation"), deleteSalaryRecord)

module.exports = router
