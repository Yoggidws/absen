/**
 * Utility functions for managing department managers
 */
const { db } = require("../config/db")

/**
 * Automatically assign a user as department manager if they have a manager role
 * and belong to a department
 *
 * @param {string} userId - The user ID
 * @param {string} role - The user's role
 * @param {string} department - The user's department name
 * @returns {Promise<boolean>} - Whether the assignment was successful
 */
const assignDepartmentManager = async (userId, role, department) => {
  try {
    // Only proceed if the user is a manager and has a department
    if ((role !== 'manager' && role !== 'admin') || !department) {
      return false
    }

    // Find the department by name
    const departmentRecord = await db("departments")
      .where({ name: department })
      .first()

    // If department doesn't exist, return false
    if (!departmentRecord) {
      console.log(`Department ${department} not found for manager assignment`)
      return false
    }

    // Check if department already has a manager
    if (departmentRecord.manager_id) {
      // If the current manager is the same user, no need to update
      if (departmentRecord.manager_id === userId) {
        return true
      }

      // If there's already a different manager, log and update anyway
      console.log(`Department ${department} already has a manager (${departmentRecord.manager_id}), replacing with new manager (${userId})`)
    }

    // Update the department with the new manager
    await db("departments")
      .where({ id: departmentRecord.id })
      .update({
        manager_id: userId,
        updated_at: db.fn.now()
      })

    console.log(`User ${userId} assigned as manager of department ${department}`)
    return true
  } catch (error) {
    console.error("Error assigning department manager:", error)
    return false
  }
}

/**
 * Update department_id in employee record based on department name
 *
 * @param {string} userId - The user ID (same as employee_id)
 * @param {string} department - The department name
 * @returns {Promise<boolean>} - Whether the update was successful
 */
const updateEmployeeDepartmentId = async (userId, department) => {
  try {
    if (!department) {
      return false
    }

    // Find the department by name
    const departmentRecord = await db("departments")
      .where({ name: department })
      .first()

    // If department doesn't exist, return false
    if (!departmentRecord) {
      console.log(`Department ${department} not found for employee department update`)
      return false
    }

    // Update the employee record with the department_id
    await db("employees")
      .where({ employee_id: userId })
      .update({
        department_id: departmentRecord.id,
        updated_at: db.fn.now()
      })

    console.log(`Updated employee ${userId} with department_id ${departmentRecord.id}`)
    return true
  } catch (error) {
    console.error("Error updating employee department_id:", error)
    return false
  }
}

module.exports = {
  assignDepartmentManager,
  updateEmployeeDepartmentId
}
