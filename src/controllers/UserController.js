const bcrypt = require("bcrypt")
const { db } = require("../config/db")

async function generateUserId() {
  // Get the last 2 digits of the current year
  const currentDate = new Date()
  const yearPart = currentDate.getFullYear().toString().slice(-2)

  // Get the month as 2 digits (01-12)
  const monthPart = (currentDate.getMonth() + 1).toString().padStart(2, '0')

  // Create the prefix for the current year and month with 3 zeros
  const prefix = `${yearPart}${monthPart}000`

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
    newId = `${yearPart}${monthPart}000${nextNum}`
  }

  return newId
}

// Export the generateUserId function
exports.generateUserId = generateUserId

exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query
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

    // Get total count for pagination
    const countQuery = db("users").count("id as count")
    if (search) {
      countQuery.where("name", "ilike", `%${search}%`).orWhere("email", "ilike", `%${search}%`)
    }

    const { count } = await countQuery.first()

    res.json({
      users,
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
      .select("id", "name", "email", "role", "department", "position", "active", "created_at")
      .first()

    if (!user) return res.status(404).json({ message: "User not found" })
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, department, position } = req.body

    if (!password) {
      return res.status(400).json({ error: "Password is required" })
    }

    // Check if email already exists
    const existingUser = await db("users").where({ email }).first()
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const userId = await generateUserId() // Generate ID based on year

    const newUser = await db("users")
      .insert({
        id: userId,
        name,
        email,
        password: hashedPassword,
        role: role || "employee",
        department: department || null,
        position: position || null,
        active: true,
      })
      .returning(["id", "name", "email", "role", "department", "position", "active", "created_at"])

    res.status(201).json(newUser[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

exports.updateUser = async (req, res) => {
  try {
    const { name, email, role, department, position, active } = req.body

    // Check if user exists
    const user = await db("users").where({ id: req.params.id }).first()
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Prepare update data
    const updateData = {}
    if (name) updateData.name = name
    if (email) updateData.email = email
    if (role) updateData.role = role
    if (department !== undefined) updateData.department = department
    if (position !== undefined) updateData.position = position
    if (active !== undefined) updateData.active = active
    updateData.updated_at = new Date()

    const updatedUser = await db("users")
      .where({ id: req.params.id })
      .update(updateData)
      .returning(["id", "name", "email", "role", "department", "position", "active", "created_at"])

    res.json(updatedUser[0])
  } catch (error) {
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
    const userId = req.params.id;

    // Only allow users to update their own profile unless they're an admin
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Not authorized to update this profile" });
    }

    const { name, email, currentPassword, newPassword, position } = req.body;

    // Check if user exists
    const user = await db("users").where({ id: userId }).first();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name;
    if (email && email !== user.email) {
      // Check if email is already in use by another user
      const existingUser = await db("users").where({ email }).first();
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ message: "Email already in use" });
      }
      updateData.email = email;
    }
    if (position) updateData.position = position;

    // If user wants to change password
    if (newPassword && currentPassword) {
      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash new password
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    updateData.updated_at = new Date();

    // Update user profile
    const updatedUser = await db("users")
      .where({ id: userId })
      .update(updateData)
      .returning(["id", "name", "email", "role", "department", "position", "active", "created_at"]);

    res.json(updatedUser[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
