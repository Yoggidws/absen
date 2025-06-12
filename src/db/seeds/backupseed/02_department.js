const { generateId } = require("../../utils/idGenerator")

/**
 * Seed file to create initial departments
 */
exports.seed = async (knex) => {
  // Check if departments table is empty
  const deptCount = await knex("departments").count("id as count").first()

  if (Number.parseInt(deptCount.count) === 0) {
    // Create departments with sequential IDs
    const departments = [
      {
        name: "Administration",
        description: "Administrative department responsible for overall management",
      },
      {
        name: "Human Resources",
        description: "Responsible for recruiting, onboarding, and employee relations",
      },
      {
        name: "Engineering",
        description: "Software development and technical operations",
      },
      {
        name: "Marketing",
        description: "Marketing, advertising, and brand management",
      },
      {
        name: "Sales",
        description: "Sales and customer acquisition",
      },
      {
        name: "Finance",
        description: "Financial planning, accounting, and reporting",
      },
      {
        name: "Customer Support",
        description: "Customer service and technical support",
      },
    ]

    // Add IDs to departments
    const departmentsWithIds = departments.map((dept, index) => ({
      ...dept,
      id: generateId("", index + 2) // Start from 2 since admin user is 1
    }))

    return knex("departments").insert(departmentsWithIds)
  }
}
