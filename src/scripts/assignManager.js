/**
 * Script to assign a manager to a specific department
 */
const { db } = require("../config/db")
const bcrypt = require("bcryptjs")

async function assignManager() {
  try {
    console.log("Starting manager assignment...")
    
    // Department to update
    const departmentName = 'Test Department 1745477094528'
    
    // Check if department exists
    const department = await db("departments").where({ name: departmentName }).first()
    if (!department) {
      console.log(`Department "${departmentName}" not found`)
      return { success: false, error: 'Department not found' }
    }
    
    console.log("Found department:", department)
    
    // Check if user with email z@example.com already exists
    const existingUser = await db("users").where({ email: 'z@example.com' }).first()
    
    let userId
    
    if (existingUser) {
      console.log("User already exists:", existingUser)
      userId = existingUser.id
      
      // Update user to be a manager of the department
      await db("users")
        .where({ id: userId })
        .update({
          role: 'manager',
          department: departmentName,
          position: 'Department Manager'
        })
      
      console.log("Updated existing user to manager role")
    } else {
      // Create a new user with manager role
      const hashedPassword = await bcrypt.hash('Password123!', 10)
      
      // Insert user and get the ID
      const [newUser] = await db("users")
        .insert({
          name: 'Z Manager',
          email: 'z@example.com',
          password: hashedPassword,
          role: 'manager',
          department: departmentName,
          position: 'Department Manager',
          active: true
        })
        .returning('*')
      
      userId = newUser.id
      console.log("Created new user with ID:", userId)
    }
    
    // Update department with manager ID
    await db("departments")
      .where({ id: department.id })
      .update({
        manager_id: userId,
        updated_at: db.fn.now()
      })
    
    console.log(`User ${userId} assigned as manager of department ${departmentName}`)
    
    // Verify the update
    const updatedDepartment = await db("departments")
      .where({ id: department.id })
      .first()
    
    console.log("Updated department:", updatedDepartment)
    
    return {
      success: true,
      userId,
      departmentId: department.id
    }
  } catch (error) {
    console.error("Error assigning manager:", error)
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
  assignManager()
    .then(result => {
      console.log("Script execution completed:", result)
      process.exit(0)
    })
    .catch(error => {
      console.error("Script execution failed:", error)
      process.exit(1)
    })
}

module.exports = assignManager
