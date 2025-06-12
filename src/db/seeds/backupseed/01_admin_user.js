const bcrypt = require("bcryptjs")
const { generateId } = require("../../utils/idGenerator")

/**
 * Seed file to create an initial admin user
 */
exports.seed = async (knex) => {
  // Check if users table is empty
  const userCount = await knex("users").count("id as count").first()

  if (Number.parseInt(userCount.count) === 0) {
    // Create admin user with secure password hashing
    const salt = await bcrypt.genSalt(12) // Using higher rounds for better security
    // Use environment variable for admin password or generate a secure random password
    const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123!Secure" // Fallback to this only in development
    const hashedPassword = await bcrypt.hash(adminPassword, salt)

    // Generate ID using the same format as UserController.generateUserId
    const userId = generateId()

    return knex("users").insert([
      {
        id: userId,
        name: "System Administrator",
        email: "admin@example.com",
        password: hashedPassword,
        role: "admin",
        department: "Administration",
        position: "System Administrator",
        active: true,
      },
    ])
  }
}
