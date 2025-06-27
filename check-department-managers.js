const { db } = require("./src/config/db")
const { assignDepartmentManager } = require("./src/utils/departmentManager")

const checkAndFixDepartmentManagers = async () => {
  try {
    console.log("Starting department manager check...")

    // Get all departments
    const departments = await db("departments as d")
      .leftJoin("users as u", "d.manager_id", "u.id")
      .select(
        "d.id",
        "d.name",
        "d.manager_id",
        "u.name as manager_name",
        "u.role as manager_role"
      )

    console.log(`Found ${departments.length} departments`)

    // For each department
    for (const dept of departments) {
      console.log(`\nChecking department: ${dept.name}`)

      // Find users with manager/admin role in this department
      const managers = await db("users")
        .where("department", dept.name)
        .whereIn("role", ["manager", "admin"])
        .where("active", true)
        .select("id", "name", "role")

      console.log(`Found ${managers.length} managers/admins in department`)

      if (managers.length > 0) {
        // If department has no manager_id, assign the first manager found
        if (!dept.manager_id) {
          const manager = managers[0]
          console.log(`Assigning ${manager.name} (${manager.id}) as manager of ${dept.name}`)
          await assignDepartmentManager(manager.id, manager.role, dept.name)
        } else {
          console.log(`Department already has manager: ${dept.manager_name} (${dept.manager_id})`)
        }
      } else {
        console.log(`No eligible managers found for department ${dept.name}`)
      }
    }

    console.log("\nDepartment manager check completed")
  } catch (error) {
    console.error("Error checking department managers:", error)
  } finally {
    await db.destroy()
  }
}

// Run the check
checkAndFixDepartmentManagers() 