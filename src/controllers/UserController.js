const bcrypt = require("bcrypt")
const { db } = require("../config/db")
const { assignDepartmentManager, updateEmployeeDepartmentId } = require("../utils/departmentManager")
const User = require("../models/User")
const Role = require("../models/Role")

async function generateUserId() {
  // Get the last 2 digits of the current year
  const currentDate = new Date()
  const yearPart = currentDate.getFullYear().toString().slice(-2)

  // Get the month as 2 digits (01-12)
  const monthPart = (currentDate.getMonth() + 1).toString().padStart(2, '0')

  // Create the prefix for the current year and month with 3 zeros
  const prefix = `${yearPart}${monthPart}`

  // Get the latest user ID for the current year and month
  const result = await db.raw(`SELECT id FROM users WHERE id::TEXT LIKE '${yearPart}${monthPart}%' ORDER BY id DESC LIMIT 1`)

  let newId
  if (result.rows.length === 0) {
    // If no users exist for this year and month, start from 0001
    newId = `${prefix}0001`
  } else {
    // Extract the sequential part (last 4 digits) and increment
    const lastId = result.rows[0].id
    const sequentialPart = lastId.slice(-4) // Get the last 4 digits
    const nextNum = (parseInt(sequentialPart) + 1).toString().padStart(4, '0')
    newId = `${yearPart}${monthPart}0${nextNum}`
  }

  return newId
}

// Export the generateUserId function
exports.generateUserId = generateUserId

exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 100, search = "" } = req.query
    const offset = (page - 1) * limit

    // Use the db object directly for queries
    const query = db("users")
      .select("id", "name", "email", "role", "department", "position", "active", "created_at")
      .limit(limit)
      .offset(offset)

    if (search) {
      query.where("name", "ilike", `%${search}%`).orWhere("email", "ilike", `%${search}%`)
    }

    const users = await query

    // Get roles for each user
    const usersWithRoles = await Promise.all(
      users.map(async (user) => {
        const roles = await User.getRoles(user.id)
        return {
          ...user,
          roles
        }
      })
    )

    // Get total count for pagination
    const countQuery = db("users").count("id as count")
    if (search) {
      countQuery.where("name", "ilike", `%${search}%`).orWhere("email", "ilike", `%${search}%`)
    }

    const { count } = await countQuery.first()

    res.json({
      users: usersWithRoles,
      total: Number.parseInt(count),
      page: Number.parseInt(page),
      limit: Number.parseInt(limit),
      totalPages: Math.ceil(Number.parseInt(count) / limit),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

exports.getUserById = async (req, res) => {
  try {
    const user = await db("users")
      .where({ id: req.params.id })
      .select(
        "id",
        "name",
        "email",
        "role",
        "department",
        "position",
        "active",
        "created_at",
        "phone",
        "emergency_contact",
        "address"
      )
      .first()

    if (!user) return res.status(404).json({ message: "User not found" })

    // Get user roles and permissions
    const roles = await User.getRoles(req.params.id)
    const permissions = await User.getPermissions(req.params.id)

    res.json({
      ...user,
      roles,
      permissions
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

exports.createUser = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      role, 
      department, 
      position, 
      roles,
      phone,
      emergencyContact,
      address 
    } = req.body

    if (!password) {
      return res.status(400).json({ error: "Password is required" })
    }

    // Check if email already exists
    const existingUser = await db("users").where({ email }).first()
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" })
    }

    const userId = await generateUserId() // Generate ID based on year

    // Determine roles to assign
    let rolesToAssign = []

    if (roles && Array.isArray(roles) && roles.length > 0) {
      // Use roles from request if provided
      rolesToAssign = roles
    } else if (role) {
      // Map legacy role to new role IDs
      switch (role) {
        case "admin":
          rolesToAssign = ["role_admin"]
          break
        case "manager":
          rolesToAssign = ["role_manager"]
          break
        case "hr":
          rolesToAssign = ["role_hr"]
          break
        case "payroll":
          rolesToAssign = ["role_payroll"]
          break
        case "hr_manager":
          rolesToAssign = ["role_hr_manager"]
          break
        default:
          rolesToAssign = ["role_employee"]
      }
    } else {
      // Default to employee role
      rolesToAssign = ["role_employee"]
    }

    // Create user data object
    const userData = {
      id: userId,
      name,
      email,
      password,
      role: role || "employee", // Keep for backward compatibility
      department: department || null,
      position: position || null,
      active: true,
      phone: phone || null,
      emergencyContact: emergencyContact || null,
      address: address || null,
    }

    // Use a transaction to ensure both user and employee are created or neither is
    await db.transaction(async (trx) => {
      // Create user with roles
      await User.create(userData, rolesToAssign)

      // Create basic employee record with the same ID
      await trx("employees")
        .insert({
          employee_id: userId,
          full_name: name,
          gender: "other", // Default value, to be updated later
          place_of_birth: "",
          date_of_birth: new Date("1900-01-01"), // Default value, to be updated later
          address: "",
          phone_number: "",
          email: email,
          marital_status: "single", // Default value, to be updated later
          number_of_children: 0,
          position: position || "",
          department: department || "",
          department_id: null, // To be updated later
          hire_date: new Date(), // Current date as hire date
          employment_status: "permanent",
          basic_salary: 0, // To be updated later
          allowance: 0,
          profile_picture: null,
          user_id: userId
        })
    })

    // Get the created user with roles and permissions
    const newUser = await db("users")
      .where({ id: userId })
      .select(["id", "name", "email", "role", "department", "position", "active", "created_at"])
      .first()

    // Add roles and permissions to response
    const userRoles = await User.getRoles(userId)
    const userPermissions = await User.getPermissions(userId)

    // If the user is a manager, automatically assign them as department manager
    if (role === 'manager' || role === 'admin' || rolesToAssign.includes("role_manager") || rolesToAssign.includes("role_admin") || rolesToAssign.includes("role_hr_manager")) {
      await assignDepartmentManager(userId, role, department)
    }

    // Update the employee's department_id based on the department name
    if (department) {
      await updateEmployeeDepartmentId(userId, department)
    }

    res.status(201).json({
      ...newUser,
      roles: userRoles,
      permissions: userPermissions
    })
  } catch (error) {
    console.error("Error creating user:", error)
    res.status(500).json({ error: error.message })
  }
}

exports.updateUser = async (req, res) => {
  try {
    const { name, email, role, department, position, active, roles } = req.body

    // Check if user exists
    const user = await db("users").where({ id: req.params.id }).first()
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Prepare update data
    const updateData = {}
    if (name) updateData.name = name
    if (email) updateData.email = email
    if (role) updateData.role = role // Keep for backward compatibility
    if (department !== undefined) updateData.department = department
    if (position !== undefined) updateData.position = position
    if (active !== undefined) updateData.active = active
    updateData.updated_at = new Date()

    // Determine roles to assign if provided
    let rolesToAssign = null

    if (roles && Array.isArray(roles) && roles.length > 0) {
      // Use roles from request if provided
      rolesToAssign = roles
    } else if (role && role !== user.role) {
      // Map legacy role to new role IDs if role is changed
      switch (role) {
        case "admin":
          rolesToAssign = ["role_admin"]
          break
        case "manager":
          rolesToAssign = ["role_manager"]
          break
        case "hr":
          rolesToAssign = ["role_hr"]
          break
        case "payroll":
          rolesToAssign = ["role_payroll"]
          break
        case "hr_manager":
          rolesToAssign = ["role_hr_manager"]
          break
        default:
          rolesToAssign = ["role_employee"]
      }
    }

    // Update user and roles if needed
    await User.update(req.params.id, updateData, rolesToAssign)

    // Get updated user with roles and permissions
    const updatedUser = await db("users")
      .where({ id: req.params.id })
      .select(["id", "name", "email", "role", "department", "position", "active", "created_at"])
      .first()

    // Add roles and permissions to response
    const userRoles = await User.getRoles(req.params.id)
    const userPermissions = await User.getPermissions(req.params.id)

    // If role is changed to manager or department is changed, update department manager assignment
    if (role === 'manager' || role === 'admin' ||
        (rolesToAssign && (rolesToAssign.includes("role_manager") || rolesToAssign.includes("role_admin") || rolesToAssign.includes("role_hr_manager"))) ||
        department !== undefined) {

      const userRole = role || user.role
      const userDepartment = department !== undefined ? department : user.department

      // If user is a manager and has a department, try to assign as department manager
      if ((userRole === 'manager' || userRole === 'admin' ||
          (rolesToAssign && (rolesToAssign.includes("role_manager") || rolesToAssign.includes("role_admin") || rolesToAssign.includes("role_hr_manager")))) &&
          userDepartment) {
        await assignDepartmentManager(req.params.id, userRole, userDepartment)
      }
    }

    // If department is changed, update the employee's department_id
    if (department !== undefined) {
      await updateEmployeeDepartmentId(req.params.id, department)
    }

    res.json({
      ...updatedUser,
      roles: userRoles,
      permissions: userPermissions
    })
  } catch (error) {
    console.error("Error updating user:", error)
    res.status(500).json({ error: error.message })
  }
}

exports.deleteUser = async (req, res) => {
  try {
    // Check if user exists
    const user = await db("users").where({ id: req.params.id }).first()
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    await db("users").where({ id: req.params.id }).delete()
    res.json({ message: "User deleted successfully" })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.params.id
    const { name, phone, emergencyContact, address } = req.body

    // Validate required fields
    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Name is required" })
    }

    // Only send the fields that should be updated in the profile
    const updateData = {
      name: name.trim(),
      phone: phone?.trim() || null,
      emergencyContact: emergencyContact?.trim() || null,
      address: address?.trim() || null,
    }

    // Update user profile
    const updatedUser = await User.update(userId, updateData)

    // Return updated user data with camelCase field names for frontend consistency
    res.json({
      user: {
        ...updatedUser,
        phone: updatedUser.phone || "",
        emergencyContact: updatedUser.emergency_contact || "",
        address: updatedUser.address || "",
      }
    })
  } catch (error) {
    console.error("Error updating profile:", error)
    res.status(500).json({ error: error.message })
  }
}

exports.changePassword = async (req, res) => {
  try {
    const userId = req.params.id;

    // Only allow users to change their own password unless they're an admin
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized to change this user's password" });
    }

    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    // Check if user exists
    const user = await db("users").where({ id: userId }).first();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db("users")
      .where({ id: userId })
      .update({
        password: hashedPassword,
        updated_at: new Date()
      });

    res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ error: error.message });
  }
}
