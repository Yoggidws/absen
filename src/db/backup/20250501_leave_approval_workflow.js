/**
 * Migration to add multi-level approval workflow for leave requests
 */
exports.up = async (knex) => {
  // First, check if the leave_approval_workflow table already exists
  const workflowTableExists = await knex.schema.hasTable("leave_approval_workflow")
  if (workflowTableExists) {
    console.log("Leave approval workflow table already exists, skipping creation")
  } else {
    // Create the leave_approval_workflow table
    await knex.schema.createTable("leave_approval_workflow", (table) => {
      table.string("id", 36).primary().notNullable().comment("Approval workflow ID")
      table
        .string("leave_request_id", 36)
        .notNullable()
        .references("id")
        .inTable("leave_requests")
        .onDelete("CASCADE")
        .comment("Reference to leave request")
      table.integer("approval_level").notNullable().comment("Approval level (1=Manager, 2=HR, 3=Admin)")
      table
        .string("approver_id", 36)
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL")
        .comment("User who approved/rejected at this level")
      table.string("approver_role", 50).nullable().comment("Role of the approver (department_manager, hr_manager, owner, etc.)")
      table
        .enum("status", ["pending", "approved", "rejected"], { useNative: true, enumName: "approval_status_type" })
        .notNullable()
        .defaultTo("pending")
        .comment("Status of this approval level")
      table.text("comments").nullable().comment("Comments from approver")
      table.timestamp("approved_at", { useTz: true }).nullable().comment("When this level was approved/rejected")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(["leave_request_id"], "idx_approval_leave_request")
      table.index(["approver_id"], "idx_approval_approver")
      table.index(["status"], "idx_approval_status")
      table.unique(["leave_request_id", "approval_level"], "unq_leave_approval_level")
    })
  }

  // Modify the leave_requests table to update the status field
  await knex.schema.raw("ALTER TYPE leave_status_type ADD VALUE IF NOT EXISTS 'in_progress'")

  // Add current_approval_level column to leave_requests table if it doesn't exist
  const hasCurrentApprovalLevel = await knex.schema.hasColumn("leave_requests", "current_approval_level")
  if (!hasCurrentApprovalLevel) {
    await knex.schema.table("leave_requests", (table) => {
      table.integer("current_approval_level").nullable().comment("Current approval level in the workflow")
    })
  }

  return Promise.resolve()
}

exports.down = async (knex) => {
  // Remove the current_approval_level column from leave_requests
  const hasCurrentApprovalLevel = await knex.schema.hasColumn("leave_requests", "current_approval_level")
  if (hasCurrentApprovalLevel) {
    await knex.schema.table("leave_requests", (table) => {
      table.dropColumn("current_approval_level")
    })
  }

  // Drop the leave_approval_workflow table
  await knex.schema.dropTableIfExists("leave_approval_workflow")

  // We can't remove values from enum types in PostgreSQL, so we'll leave 'in_progress' in the enum

  return Promise.resolve()
}
