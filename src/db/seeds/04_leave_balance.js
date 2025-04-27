/**
 * Seed file for leave balance
 */
const { v4: uuidv4 } = require("uuid")

exports.seed = async function (knex) {
  // Check if there's already data in the leave_balance table
  const existingData = await knex("leave_balance").select("*").limit(1)
  if (existingData.length > 0) {
    console.log("Leave balance table already has data, skipping seed")
    return Promise.resolve()
  }

  // Get all active users
  const users = await knex("users").where({ active: true }).select("id")
  
  // Get current year
  const currentYear = new Date().getFullYear()
  
  // Prepare leave balance records for each user
  const leaveBalanceRecords = users.map(user => ({
    id: `LB-${uuidv4().substring(0, 8).toUpperCase()}`,
    user_id: user.id,
    year: currentYear,
    total_allowance: 20,
    used_days: 0,
    remaining_days: 20,
    carried_over: 0,
    sick_allowance: 10,
    sick_used: 0,
    personal_allowance: 5,
    personal_used: 0,
    created_at: new Date(),
    updated_at: new Date()
  }))
  
  // Insert the records
  return knex("leave_balance").insert(leaveBalanceRecords)
}
