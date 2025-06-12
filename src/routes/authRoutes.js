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
  logout,
} = require("../controllers/authController")
const { enhancedProtect, logout: logoutMiddleware } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")

// Public routes
router.post("/register", register)
router.post("/login", login)
router.post("/forgot-password", forgotPassword)
router.post("/reset-password/:resetToken", resetPassword)

// Logout route
router.post("/logout", enhancedProtect, logoutMiddleware, logout)

// Protected routes for own profile
router
  .route("/profile")
  .get(enhancedProtect, rbac.can("read:profile:own"), getProfile)
  .put(enhancedProtect, rbac.can("update:profile:own"), updateProfile)

// Admin/HR routes for user management
router
  .route("/users")
  .get(enhancedProtect, rbac.can("read:user"), getAllUsers)

router
  .route("/users/:id")
  .get(enhancedProtect, rbac.can("read:user"), getUserById)
  .put(enhancedProtect, rbac.can("update:user"), updateUser)
  .delete(enhancedProtect, rbac.can("delete:user"), deleteUser)

module.exports = router
