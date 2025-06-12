const express = require("express")
const router = express.Router()

const {
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    updateProfile,
    changePassword,
} = require("../controllers/UserController")

const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac } = require("../middlewares/rbacMiddleware")


// --- Admin-facing routes for user management ---

// Get all users and create a new user
router
    .route("/")
    .get(enhancedProtect, rbac.can("read:user:all"), getAllUsers)
    .post(enhancedProtect, rbac.can("create:user"), createUser)

// Get, update, or delete a specific user
router
    .route("/:id")
    .get(enhancedProtect, rbac.can("read:user:all"), getUserById)
    .put(enhancedProtect, rbac.can("update:user"), updateUser)
    .delete(enhancedProtect, rbac.can("delete:user"), deleteUser)


// --- Routes for individual users to manage their own data ---

// Update own profile information
router
    .route("/:id/profile")
    .put(enhancedProtect, updateProfile)

// Change own password
router
    .route("/:id/change-password")
    .put(enhancedProtect, changePassword)


module.exports = router
