/**
 * Script to assign existing users with Manager roles as department managers
 * Run this script once to update existing data
 */
const { db } = require("../config/db")
const { assignDepartmentManager, updateEmployeeDepartmentId } = require("../utils/departmentManager")

const assignExistingManagers = async () => {
  try {
    console.log("Starting assignment of existing managers to departments...")
    
    // Get all users with manager or admin role who have a department
    const managers = await db("users")
      .whereIn("role", ["manager", "admin"])
      .whereNotNull("department")
      .select("id", "name", "email", "role", "department")
    
    console.log(`Found ${managers.length} managers/admins with departments`)
    
    // Process each manager
    let assignedCount = 0
    let updatedEmployeeCount = 0
    
    for (const manager of managers) {
      // First update the employee's department_id
      const employeeUpdated = await updateEmployeeDepartmentId(manager.id, manager.department)
      if (employeeUpdated) {
        updatedEmployeeCount++
      }
      
      // Then try to assign as department manager
      const assigned = await assignDepartmentManager(manager.id, manager.role, manager.department)
      if (assigned) {
        assignedCount++
        console.log(`Assigned ${manager.name} (${manager.id}) as manager of ${manager.department}`)
      }
    }
    
    console.log(`Completed assignment of existing managers:`)
    console.log(`- ${assignedCount} managers assigned to departments`)
    console.log(`- ${updatedEmployeeCount} employee records updated with department_id`)
    
    return {
      success: true,
      managersAssigned: assignedCount,
      employeesUpdated: updatedEmployeeCount
    }
  } catch (error) {
    console.error("Error assigning existing managers:", error)
    return {
      success: false,
      error: error.message
    }
  } finally {
    // Close the database connection
    await db.destroy()
  }
}

// Run the script if executed directly
if (require.main === module) {
  assignExistingManagers()
    .then(result => {
      console.log("Script execution completed:", result)
      process.exit(0)
    })
    .catch(error => {
      console.error("Script execution failed:", error)
      process.exit(1)
    })
}

module.exports = assignExistingManagers
