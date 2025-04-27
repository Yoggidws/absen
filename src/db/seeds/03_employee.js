const bcrypt = require("bcryptjs")
const { generateId } = require("../../utils/idGenerator")

/**
 * Seed file to create sample employees
 */
exports.seed = async (knex) => {
  // Only seed if we have fewer than 2 users (just the admin)
  const userCount = await knex("users").count("id as count").first()

  if (Number.parseInt(userCount.count) <= 1) {
    // Get department IDs
    const departments = await knex("departments").select("id", "name")
    const deptMap = {}
    departments.forEach((dept) => {
      deptMap[dept.name] = dept.id
    })

    // Create secure password for test users
    const salt = await bcrypt.genSalt(12)
    const hashedPassword = await bcrypt.hash("Employee@123", salt)

    // Sample employees with different roles and departments
    const employeeData = [
      {
        name: "John Manager",
        email: "manager@example.com",
        password: hashedPassword,
        role: "manager",
        department: "Engineering",
        position: "Engineering Manager",
        active: true,
      },
      {
        name: "Alice Developer",
        email: "alice@example.com",
        password: hashedPassword,
        role: "employee",
        department: "Engineering",
        position: "Senior Developer",
        active: true,
      },
      {
        name: "Bob Designer",
        email: "bob@example.com",
        password: hashedPassword,
        role: "employee",
        department: "Marketing",
        position: "UI/UX Designer",
        active: true,
      },
      {
        name: "Carol HR",
        email: "carol@example.com",
        password: hashedPassword,
        role: "manager",
        department: "Human Resources",
        position: "HR Manager",
        active: true,
      },
      {
        name: "Dave Sales",
        email: "dave@example.com",
        password: hashedPassword,
        role: "employee",
        department: "Sales",
        position: "Sales Representative",
        active: true,
      },
      {
        name: "Eve Finance",
        email: "eve@example.com",
        password: hashedPassword,
        role: "employee",
        department: "Finance",
        position: "Financial Analyst",
        active: true,
      },
      {
        name: "Frank Support",
        email: "frank@example.com",
        password: hashedPassword,
        role: "employee",
        department: "Customer Support",
        position: "Support Specialist",
        active: true,
      },
      {
        name: "Grace Intern",
        email: "grace@example.com",
        password: hashedPassword,
        role: "employee",
        department: "Engineering",
        position: "Intern Developer",
        active: true,
      },
      {
        name: "Inactive User",
        email: "inactive@example.com",
        password: hashedPassword,
        role: "employee",
        department: "Marketing",
        position: "Former Employee",
        active: false,
      },
    ]

    // Add IDs to employees
    const employees = employeeData.map((emp, index) => ({
      ...emp,
      id: generateId("", index + 9) // Start from 9 since we already have admin user and departments
    }))

    return knex("users").insert(employees)
  }
}
