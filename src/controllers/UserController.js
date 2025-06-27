const bcrypt = require("bcryptjs")
const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const { clearCache } = require("../middlewares/permissionMiddleware")
const { assignDepartmentManager, updateEmployeeDepartmentId } = require("../utils/departmentManager")
const User = require("../models/User")
const Role = require("../models/Role")

/**
 * Generates a unique, sequential user ID with a '2505' prefix.
 * @returns {Promise<string>} The newly generated user ID.
 */
const generateUserId = async () => {
  const result = await db.raw(`SELECT id FROM users WHERE id::TEXT LIKE '2505%' ORDER BY id DESC LIMIT 1`)
  let newId
  if (result.rows.length === 0) {
    newId = '25050001'
  } else {
    const lastId = result.rows[0].id
    const numericPart = lastId.substring(4)
    const nextNum = (parseInt(numericPart, 10) + 1).toString().padStart(4, '0')
    newId = `2505${nextNum}`
  }
  return newId
}

/**
 * @desc    Get all users
 * @route   GET /api/users
 * @access  Private (read:user:all)
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await db("users").select("id", "name", "email", "role", "active", "department", "position").orderBy("name")
  res.status(200).json({ success: true, count: users.length, data: users })
})

/**
 * @desc    Get user by ID
 * @route   GET /api/users/:id
 * @access  Private (read:user:all or read:user:own)
 */
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params
  
  // A user should be able to get their own data, or an admin can get any.
  if (req.user.id !== id && !req.user.permissions.includes("read:user:all")) {
      res.status(403)
      throw new Error("Forbidden: You do not have permission to view this user's data.")
  }

  const user = await db("users")
    .join("employees as e", "users.id", "e.employee_id")
    .join("departments as d", "e.department", "d.id")
    .select(
      "users.id",
      "users.name",
      "users.email",
      "users.role",
      "users.active",
      "e.gender",
      "e.date_of_birth",
      "e.marital_status",
      "e.address",
      "e.phone_number",
      "e.place_of_birth",
      "e.basic_salary",
      "e.number_of_children",
      "d.name as department_name"
    )
    .where("users.id", id)
    .first()

  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }
  res.status(200).json({ success: true, data: user })
})

/**
 * @desc    Create a new user
 * @route   POST /api/users
 * @access  Private (create:user)
 */
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, department, position, gender, date_of_birth, marital_status, address, phone_number, place_of_birth, basic_salary, number_of_children } = req.body

  const userExists = await db("users").where({ email }).first()
  if (userExists) {
    res.status(400)
    throw new Error("User with that email already exists")
  }

  const salt = await bcrypt.genSalt(10)
  const hashedPassword = await bcrypt.hash(password, salt)
  const userId = await generateUserId()
  const userRole = role || "employee"
  
  const roleMap = {
      "admin": "role_admin",
      "manager": "role_manager",
      "hr": "role_hr",
      "payroll": "role_payroll",
      "employee": "role_employee"
  };
  const roleId = roleMap[userRole] || "role_employee";

  await db.transaction(async (trx) => {
    const [newUser] = await trx("users").insert({
      id: userId,
      name,
      email,
      password: hashedPassword,
      role: userRole,
      department,
      position
    }).returning("*")

    await trx("user_roles").insert({
        user_id: userId,
        role_id: roleId
    })
    
    // Also create a basic employee record
    await trx('employees').insert({
        employee_id: userId,
        full_name: name,
        gender: gender || 'other',
        email: email,
        position: position || 'N/A',
        department: department || 'N/A',
        hire_date: new Date(),
        employment_status: 'permanent',
        user_id: userId,
        date_of_birth: date_of_birth || '1970-01-01',
        marital_status: marital_status || 'single',
        address: address || 'N/A',
        phone_number: phone_number || 'N/A',
        place_of_birth: place_of_birth || 'N/A',
        basic_salary: basic_salary || 0,
        number_of_children: number_of_children || 0
    });
    
    delete newUser.password
    res.status(201).json({ success: true, data: newUser })
  })
})

/**
 * @desc    Update a user
 * @route   PUT /api/users/:id
 * @access  Private (update:user)
 */
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, email, role, active, department, position } = req.body

  const updateData = {}
  if (name) updateData.name = name
  if (email) updateData.email = email
  if (role) updateData.role = role
  if (active !== undefined) updateData.active = active
  if (department) updateData.department = department
  if (position) updateData.position = position

  const [updatedUser] = await db("users").where({ id }).update(updateData).returning("*")

  if (!updatedUser) {
      res.status(404);
      throw new Error('User not found');
  }

  clearCache(id);
  delete updatedUser.password
  res.status(200).json({ success: true, data: updatedUser })
})

/**
 * @desc    Delete a user
 * @route   DELETE /api/users/:id
 * @access  Private (delete:user)
 */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params

  if (id === req.user.id) {
    res.status(400)
    throw new Error("You cannot delete your own account.")
  }

  // Check if user exists and get their role
  const user = await db("users").where({ id }).first()
  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  await db.transaction(async trx => {
    // 1. Remove user from being a department manager
    await trx("departments").where({ manager_id: id }).update({ manager_id: null });

    // 2. Delete user roles
    await trx('user_roles').where({ user_id: id }).del();

    // 3. Delete compensation records
    await trx('compensation').where({ user_id: id }).del();

    // 4. Delete payroll items
    await trx('payroll_items').where({ user_id: id }).del();

    // 5. Delete leave requests
    await trx('leave_requests').where({ user_id: id }).del();

    // 6. Update tasks where user is assigned
    await trx('onboarding_tasks').where({ assigned_to: id }).update({ assigned_to: null });
    await trx('offboarding_tasks').where({ assigned_to: id }).update({ assigned_to: null });

    // 7. Delete or update employee record
    await trx('employees').where({ user_id: id }).update({ user_id: null });

    // 8. Finally delete the user
    await trx("users").where({ id }).del();
  })

  clearCache(id);
  res.status(200).json({ success: true, message: "User deleted successfully" })
})

/**
 * @desc    Update user's own profile
 * @route   PUT /api/users/:id/profile
 * @access  Private
 */
const updateProfile = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, email } = req.body;

    // Users can only update their own profile
    if (req.user.id !== id) {
        res.status(403);
        throw new Error("Forbidden: You can only update your own profile.");
    }
    
    const [updatedUser] = await db('users').where({ id }).update({ name, email }).returning(['id', 'name', 'email']);
    res.status(200).json({ success: true, data: updatedUser });
});

/**
 * @desc    Change user's own password
 * @route   PUT /api/users/:id/change-password
 * @access  Private
 */
const changePassword = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { oldPassword, newPassword } = req.body;

    if (req.user.id !== id) {
        res.status(403);
        throw new Error("Forbidden: You can only change your own password.");
    }

    const user = await db('users').where({ id }).first();
    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
        res.status(400);
        throw new Error('Incorrect old password');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await db('users').where({ id }).update({ password: hashedPassword });

    res.status(200).json({ success: true, message: 'Password changed successfully' });
});

module.exports = {
    generateUserId,
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    updateProfile,
    changePassword,
};
