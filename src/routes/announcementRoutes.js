const express = require("express")
const router = express.Router()
const {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} = require("../controllers/announcementController")
const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")

// Public route to get announcements
router.route("/").get(getAnnouncements)

// Protected routes for managing announcements
router
  .route("/")
  .post(enhancedProtect, rbac.can("create:announcement"), createAnnouncement)

router
  .route("/:id")
  .put(enhancedProtect, rbac.can("update:announcement"), updateAnnouncement)
  .delete(enhancedProtect, rbac.can("delete:announcement"), deleteAnnouncement)

module.exports = router 