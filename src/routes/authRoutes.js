const express = require("express")
const router = express.Router()
const {
  register,
  login,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
} = require("../controllers/authController")
const { protect, admin } = require("../middlewares/authMiddleware")

// Public routes
router.post("/register", register)
router.post("/login", login)
router.post("/forgot-password", forgotPassword)
router.post("/reset-password/:resetToken", resetPassword)

// Protected routes
router.get("/profile", protect, getProfile)
router.put("/profile", protect, updateProfile)

// Admin routes
router.get("/users", protect, admin, getAllUsers)
router.get("/users/:nik", protect, admin, getUserById)
router.put("/users/:id", protect, admin, updateUser)
router.delete("/users/:id", protect, admin, deleteUser)

module.exports = router
