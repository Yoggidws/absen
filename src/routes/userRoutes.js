const express = require("express")
const userController = require("../controllers/UserController")
// Change the middleware imports to match what's exported from authMiddleware.js
const { protect, admin } = require("../middlewares/authMiddleware")

const router = express.Router()
// Update the middleware names to match what's imported
router.get("/", protect, userController.getAllUsers)
router.get("/:id", protect, userController.getUserById)
router.post("/", protect, admin, userController.createUser)
router.put("/:id", protect, admin, userController.updateUser)
router.delete("/:id", protect, admin, userController.deleteUser)
router.put("/:id/profile", protect, userController.updateProfile)
router.put("/:id/change-password", protect, userController.changePassword)

module.exports = router
