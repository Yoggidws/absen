const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const emailUtils = require("../utils/emailUtils")
const { generateUserId } = require("../controllers/UserController")

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  })
}

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, department, position } = req.body

  const userExists = await db("users").where({ email }).first()
  if (userExists) {
    res.status(400)
    throw new Error("User already exists")
  }

  const salt = await bcrypt.genSalt(10)
  const hashedPassword = await bcrypt.hash(password, salt)

  // Generate a sequential ID using the same format as in UserController
  const userId = await generateUserId()

  const inserted = await db("users")
    .insert({
      id: userId,
      name,
      email,
      password: hashedPassword,
      department,
      position,
      role: "employee",
    })
    .returning("id")

  const user = await db("users")
    .where({ id: userId })
    .select("id", "name", "email", "role", "department", "position", "avatar", "created_at")
    .first()

  if (user) {
    const token = generateToken(user.id)
    await emailUtils.sendWelcomeEmail(user)

    res.status(201).json({
      success: true,
      user,
      token,
    })
  } else {
    res.status(400)
    throw new Error("Invalid user data")
  }
})

// exports.register = asyncHandler(async (req, res) => {
//   const { name, email, password, department, position } = req.body

//   // Check if user already exists
//   const userExists = await db("users").where({ email }).first()

//   if (userExists) {
//     res.status(400)
//     throw new Error("User already exists")
//   }

//   // Hash password
//   const salt = await bcrypt.genSalt(10)
//   const hashedPassword = await bcrypt.hash(password, salt)

//   // Create user
//   const [userId] = await db("users")
//     .insert({
//       name,
//       email,
//       password: hashedPassword,
//       department,
//       position,
//       role: "employee", // Default role
//     })
//     .returning("id")

//   // Get the created user
//   const user = await db("users")
//     .where({ id: userId })
//     .select("id", "name", "email", "role", "department", "position", "avatar", "created_at")
//     .first()

//   if (user) {
//     // Generate token
//     const token = generateToken(user.id)

//     // Send welcome email
//     await emailUtils.sendWelcomeEmail(user)

//     res.status(201).json({
//       success: true,
//       user,
//       token,
//     })
//   } else {
//     res.status(400)
//     throw new Error("Invalid user data")
//   }
// })

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body

  // Check for user email
  const user = await db("users").where({ email }).first()

  if (!user) {
    res.status(401)
    throw new Error("Invalid credentials")
  }

  // Check if user is active
  if (!user.active) {
    res.status(401)
    throw new Error("Your account has been deactivated. Please contact an administrator.")
  }

  // Check if password matches
  const isMatch = await bcrypt.compare(password, user.password)

  if (!isMatch) {
    res.status(401)
    throw new Error("Invalid credentials")
  }

  // Generate token
  const token = generateToken(user.id)

  // Remove sensitive data from response
  delete user.password
  delete user.reset_password_token
  delete user.reset_password_expire

  res.status(200).json({
    success: true,
    user,
    token,
  })
})

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
exports.getProfile = asyncHandler(async (req, res) => {
  const user = await db("users")
    .where({ id: req.user.id })
    .select("id", "name", "email", "role", "department", "position", "avatar", "created_at")
    .first()

  if (user) {
    res.status(200).json({
      success: true,
      user,
    })
  } else {
    res.status(404)
    throw new Error("User not found")
  }
})

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, email, password, department, position, avatar } = req.body

  // Get user
  const user = await db("users").where({ id: req.user.id }).first()

  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Prepare update data
  const updateData = {}
  if (name) updateData.name = name
  if (email) updateData.email = email
  if (department) updateData.department = department
  if (position) updateData.position = position
  if (avatar) updateData.avatar = avatar

  // If password is provided, hash it
  if (password) {
    const salt = await bcrypt.genSalt(10)
    updateData.password = await bcrypt.hash(password, salt)
  }

  // Update user
  const updatedUser = await db("users")
    .where({ id: req.user.id })
    .update(updateData)
    .returning(["id", "name", "email", "role", "department", "position", "avatar", "created_at", "updated_at"])

  res.status(200).json({
    success: true,
    user: updatedUser[0],
  })
})

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body

  // Find user by email
  const user = await db("users").where({ email }).first()

  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(20).toString("hex")

  // Hash token and set to resetPasswordToken field
  const resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex")

  // Set token expire time (10 minutes)
  const resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000)

  // Update user with reset token info
  await db("users").where({ id: user.id }).update({
    reset_password_token: resetPasswordToken,
    reset_password_expire: resetPasswordExpire,
  })

  // Create reset URL
  const resetUrl = `${req.protocol}://${req.get("host")}/reset-password/${resetToken}`

  // Send email with reset URL
  try {
    await emailUtils.sendPasswordResetEmail(user, resetUrl)

    res.status(200).json({
      success: true,
      message: "Password reset email sent",
    })
  } catch (error) {
    // If email fails, remove reset token from user
    await db("users").where({ id: user.id }).update({
      reset_password_token: null,
      reset_password_expire: null,
    })

    res.status(500)
    throw new Error("Email could not be sent")
  }
})

// @desc    Reset password
// @route   POST /api/auth/reset-password/:resetToken
// @access  Public
exports.resetPassword = asyncHandler(async (req, res) => {
  // Get token from params and hash it
  const resetToken = crypto.createHash("sha256").update(req.params.resetToken).digest("hex")

  // Find user with valid token and not expired
  const user = await db("users")
    .where({
      reset_password_token: resetToken,
    })
    .where("reset_password_expire", ">", new Date())
    .first()

  if (!user) {
    res.status(400)
    throw new Error("Invalid or expired token")
  }

  // Set new password
  const { password } = req.body
  const salt = await bcrypt.genSalt(10)
  const hashedPassword = await bcrypt.hash(password, salt)

  // Update user
  await db("users").where({ id: user.id }).update({
    password: hashedPassword,
    reset_password_token: null,
    reset_password_expire: null,
  })

  // Generate new token
  const token = generateToken(user.id)

  res.status(200).json({
    success: true,
    message: "Password reset successful",
    token,
  })
})

// @desc    Get all users
// @route   GET /api/auth/users
// @access  Private/Admin
exports.getAllUsers = asyncHandler(async (req, res) => {
  // Query parameters for filtering
  const { department, role, active, search } = req.query

  // Start building query
  let query = db("users").select(
    "id",
    "name",
    "email",
    "role",
    "department",
    "position",
    "avatar",
    "active",
    "created_at",
  )

  // Apply filters if provided
  if (department) {
    query = query.where("department", department)
  }

  if (role) {
    query = query.where("role", role)
  }

  if (active !== undefined) {
    query = query.where("active", active === "true")
  }

  if (search) {
    query = query.where(function () {
      this.where("name", "ilike", `%${search}%`)
        .orWhere("email", "ilike", `%${search}%`)
        .orWhere("department", "ilike", `%${search}%`)
        .orWhere("position", "ilike", `%${search}%`)
    })
  }

  // Execute query
  const users = await query

  res.status(200).json({
    success: true,
    count: users.length,
    users,
  })
})

// @desc    Get user by ID
// @route   GET /api/auth/users/:id
// @access  Private/Admin
exports.getUserById = asyncHandler(async (req, res) => {
  const user = await db("users")
    .where({ id: req.params.id })
    .select("id", "name", "email", "role", "department", "position", "avatar", "active", "created_at")
    .first()

  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  res.status(200).json({
    success: true,
    user,
  })
})

// @desc    Update user
// @route   PUT /api/auth/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, department, position, active, password } = req.body

  // Check if user exists
  const user = await db("users").where({ id: req.params.id }).first()

  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Prepare update data
  const updateData = {}
  if (name !== undefined) updateData.name = name
  if (email !== undefined) updateData.email = email
  if (role !== undefined) updateData.role = role
  if (department !== undefined) updateData.department = department
  if (position !== undefined) updateData.position = position
  if (active !== undefined) updateData.active = active

  // If password is provided, hash it
  if (password) {
    const salt = await bcrypt.genSalt(10)
    updateData.password = await bcrypt.hash(password, salt)
  }

  // Update user
  const updatedUser = await db("users")
    .where({ id: req.params.id })
    .update(updateData)
    .returning([
      "id",
      "name",
      "email",
      "role",
      "department",
      "position",
      "avatar",
      "active",
      "created_at",
      "updated_at",
    ])

  res.status(200).json({
    success: true,
    user: updatedUser[0],
  })
})

// @desc    Delete user
// @route   DELETE /api/auth/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res) => {
  // Check if user exists
  const user = await db("users").where({ id: req.params.id }).first()

  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Prevent admin from deleting themselves
  if (user.id === req.user.id) {
    res.status(400)
    throw new Error("Cannot delete your own account")
  }

  // Delete user
  await db("users").where({ id: req.params.id }).del()

  res.status(200).json({
    success: true,
    message: "User deleted successfully",
  })
})
