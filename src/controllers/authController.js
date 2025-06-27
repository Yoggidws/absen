const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const { db, getPoolStatus } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const emailUtils = require("../utils/emailUtils")
const { generateUserId } = require("../controllers/UserController")
const { assignDepartmentManager, updateEmployeeDepartmentId } = require("../utils/departmentManager")
const { loadUserAuthData } = require("../middlewares/rbacMiddleware")
const { clearUserCache } = require("../middlewares/enhancedAuthMiddleware")

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
  const { name, email, password, department, position, role } = req.body

  const userExists = await db("users").where({ email }).first()
  if (userExists) {
    res.status(400)
    throw new Error("User already exists")
  }

  const salt = await bcrypt.genSalt(10)
  const hashedPassword = await bcrypt.hash(password, salt)

  // Generate a sequential ID using the same format as in UserController
  const userId = await generateUserId()

  // Determine the role and corresponding role ID
  const userRole = role || "employee"
  let roleId
  switch (userRole) {
    case "admin":
      roleId = "role_admin"
      break
    case "administrator":
      roleId = "role_admin"
      break
    case "manager":
      roleId = "role_manager"
      break
    case "hr":
      roleId = "role_hr"
      break
    case "payroll":
      roleId = "role_payroll"
      break
    case "hr_manager":
      roleId = "role_hr_manager"
      break
    default:
      roleId = "role_employee"
  }

  // Use a transaction to ensure both user and employee are created or neither is
  await db.transaction(async (trx) => {
    // Insert user
    await trx("users")
      .insert({
        id: userId,
        name,
        email,
        password: hashedPassword,
        department,
        position,
        role: userRole,
      })

    // Assign user to role in the role-permission system
    await trx("user_roles").insert({
      user_id: userId,
      role_id: roleId,
    })

    // Create basic employee record with the same ID
    // This ensures every user has an employee record for HR purposes
    await trx("employees")
      .insert({
        employee_id: userId,
        full_name: name,
        gender: "other",
        place_of_birth: "",
        date_of_birth: new Date("1900-01-01"),
        address: "",
        phone_number: "",
        email: email,
        marital_status: "single",
        number_of_children: 0,
        position: position || "",
        department: department || "",
        department_id: null,
        hire_date: new Date(),
        employment_status: "permanent",
        basic_salary: 0,
        allowance: 0,
        profile_picture: null,
        user_id: userId
      })
  })

  const user = await db("users")
    .where({ id: userId })
    .select("id", "name", "email", "role", "department", "position", "avatar", "created_at")
    .first()

  if (user) {
    // If the user has a department, update the employee's department_id
    if (department) {
      await updateEmployeeDepartmentId(userId, department)

      // If user is a manager or admin, try to assign as department manager
      if (userRole === 'manager' || userRole === 'admin') {
        await assignDepartmentManager(userId, userRole, department)
      }
    }

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

exports.login = asyncHandler(async (req, res) => {
  try {
    // Log pool status before login
    const poolStatusBefore = getPoolStatus();
    console.log("Database pool status before login:", poolStatusBefore);

    // Check if we're hitting connection limits
    if (poolStatusBefore.used >= poolStatusBefore.max - 1) {
      console.warn("WARNING: Database connection pool near capacity. Used:",
        poolStatusBefore.used, "Max:", poolStatusBefore.max);
    }

    const { email, password } = req.body

    // Check for user email - use a transaction to ensure connection is released
    let user;
    await db.transaction(async (trx) => {
      // Get user with transaction
      user = await trx("users").where({ email }).first();

      if (!user) {
        res.status(401);
        throw new Error("Invalid credentials");
      }

      // Check if user is active
      if (!user.active) {
        res.status(401);
        throw new Error("Your account has been deactivated. Please contact an administrator.");
      }

      // Check if password matches
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        res.status(401);
        throw new Error("Invalid credentials");
      }
    });

    // Generate token
    const token = generateToken(user.id);

    // Fetch roles and permissions
    const authData = await loadUserAuthData(user.id);

    // Remove sensitive data from response
    delete user.password;
    delete user.reset_password_token;
    delete user.reset_password_expire;

    // Log pool status after login
    const poolStatusAfter = getPoolStatus();
    console.log("Database pool status after login:", poolStatusAfter);

    res.status(200).json({
      success: true,
      user: {
        ...authData.user, // The core user object from the DB
        roles: authData.roles,
        permissions: authData.permissions,
        roleNames: authData.roleNames,
        permissionNames: authData.permissionNames,
      },
      token,
    });
  } catch (error) {
    // If there's an error about connection slots, log it clearly
    if (error.message && error.message.includes("connection slots")) {
      console.error("DATABASE CONNECTION LIMIT ERROR:", error.message);

      // Return a more user-friendly error
      res.status(503).json({
        success: false,
        message: "The server is currently experiencing high load. Please try again in a few moments.",
        error: "Database connection limit reached"
      });
    } else {
      // Re-throw other errors to be handled by the error middleware
      throw error;
    }
  }
})

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
exports.getProfile = asyncHandler(async (req, res) => {
  // req.user and req.authData are populated by the 'enhancedProtect' middleware
  const { user, authData } = req

  if (user && authData) {
    // Construct the same user object shape as the login response
    const userProfile = {
      ...authData.user, // The core user object from the DB
      roles: authData.roles,
      permissions: authData.permissions,
      roleNames: authData.roleNames,
      permissionNames: authData.permissionNames,
    }

    res.status(200).json({
      success: true,
      user: userProfile,
    })
  } else {
    res.status(404)
    throw new Error("User not found or session invalid")
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

  // Clear permission cache for the user since their data changed
  clearUserCache(req.user.id);

  // If department is changed, update the employee's department_id
  if (department) {
    await updateEmployeeDepartmentId(req.user.id, department)

    // If user is a manager, try to assign as department manager
    if (user.role === 'manager' || user.role === 'admin') {
      await assignDepartmentManager(req.user.id, user.role, department)
    }
  }

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

  // Clear permission cache for the user since their roles/data may have changed
  clearUserCache(req.params.id);

  // If role is changed to manager or department is changed, update department manager assignment
  if (role === 'manager' || role === 'admin' || department !== undefined) {
    const userRole = role || user.role
    const userDepartment = department !== undefined ? department : user.department

    // If user is a manager and has a department, try to assign as department manager
    if ((userRole === 'manager' || userRole === 'admin') && userDepartment) {
      await assignDepartmentManager(req.params.id, userRole, userDepartment)
    }
  }

  // If department is changed, update the employee's department_id
  if (department !== undefined) {
    await updateEmployeeDepartmentId(req.params.id, department)
  }

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

  // Clear cache before deleting user
  clearUserCache(req.params.id);

  // Delete user
  await db("users").where({ id: req.params.id }).del()

  res.status(200).json({
    success: true,
    message: "User deleted successfully",
  })
})

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res, next) => {
  // The actual token invalidation is handled by the enhancedAuthMiddleware's logout function
  // This controller is here to make the route consistent
  res.status(200).json({
    success: true,
    message: "Logged out successfully"
  })
})
