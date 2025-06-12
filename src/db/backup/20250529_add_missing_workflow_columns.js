/**
 * Migration to add missing columns to leave_approval_workflow table
 */
exports.up = async (knex) => {
  // Check if the table exists
  const tableExists = await knex.schema.hasTable("leave_approval_workflow")
  if (!tableExists) {
    console.log("leave_approval_workflow table does not exist, skipping column additions")
    return
  }

  // Add approver_role column if it doesn't exist
  const hasApproverRole = await knex.schema.hasColumn("leave_approval_workflow", "approver_role")
  if (!hasApproverRole) {
    await knex.schema.table("leave_approval_workflow", (table) => {
      table.string("approver_role", 50).nullable().comment("Role of the approver (department_manager, hr_manager, owner, etc.)")
    })
    console.log("Added approver_role column to leave_approval_workflow table")
  }

  // Add approved_at column if it doesn't exist
  const hasApprovedAt = await knex.schema.hasColumn("leave_approval_workflow", "approved_at")
  if (!hasApprovedAt) {
    await knex.schema.table("leave_approval_workflow", (table) => {
      table.timestamp("approved_at", { useTz: true }).nullable().comment("When this level was approved/rejected")
    })
    console.log("Added approved_at column to leave_approval_workflow table")
  }

  return Promise.resolve()
}

exports.down = async (knex) => {
  // Remove the columns if they exist
  const hasApproverRole = await knex.schema.hasColumn("leave_approval_workflow", "approver_role")
  if (hasApproverRole) {
    await knex.schema.table("leave_approval_workflow", (table) => {
      table.dropColumn("approver_role")
    })
  }

  const hasApprovedAt = await knex.schema.hasColumn("leave_approval_workflow", "approved_at")
  if (hasApprovedAt) {
    await knex.schema.table("leave_approval_workflow", (table) => {
      table.dropColumn("approved_at")
    })
  }

  return Promise.resolve()
} 