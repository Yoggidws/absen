/**
 * Leave System migration
 * Combines leave requests, leave balance, approval workflow, and all leave-related features
 */
exports.up = async (knex) => {
  // Create enum types for leave system
  await knex.raw(`CREATE TYPE leave_type AS ENUM ('annual', 'sick', 'long', 'maternity', 'paternity', 'marriage', 'death', 'hajj_umrah')`)
  await knex.raw(`CREATE TYPE leave_status_type AS ENUM ('pending', 'approved', 'rejected', 'in_progress')`)
  await knex.raw(`CREATE TYPE approval_status_type AS ENUM ('pending', 'approved', 'rejected')`)

  return knex.schema
    // Leave requests table
    .createTable("leave_requests", (table) => {
      table.string("id", 36).primary().notNullable().comment("Leave request ID")
      table
        .string("user_id", 36)
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE")
        .comment("User requesting leave")
      table
        .specificType("type", "leave_type")
        .notNullable()
        .comment("Type of leave")
      table.date("start_date").notNullable().comment("First day of leave")
      table.date("end_date").notNullable().comment("Last day of leave")
      table.text("reason").notNullable().comment("Reason for leave request")
      table
        .specificType("status", "leave_status_type")
        .notNullable()
        .defaultTo("pending")
        .comment("Status of leave request")
      table
        .string("approved_by", 36)
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL")
        .comment("User who approved/rejected")
      table.text("approval_notes").nullable().comment("Notes from approver")
      table.integer("current_approval_level").nullable().comment("Current approval level in the workflow")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(["user_id"], "idx_leave_user")
      table.index(["status"], "idx_leave_status")
      table.index(["start_date", "end_date"], "idx_leave_dates")
    })

    // Leave approval workflow table
    .createTable("leave_approval_workflow", (table) => {
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
        .specificType("status", "approval_status_type")
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

    // Leave balance table
    .createTable("leave_balance", (table) => {
      table.string("id", 36).primary().notNullable().comment("Leave balance ID")
      table
        .string("user_id", 36)
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE")
        .comment("User ID")
      table.integer("year").notNullable().comment("Year for this balance")
      table.decimal("annual_leave", 10, 2).notNullable().defaultTo(20).comment("Annual leave balance")
      table.decimal("sick_leave", 10, 2).notNullable().defaultTo(10).comment("Sick leave balance")
      table.decimal("other_leave", 10, 2).notNullable().defaultTo(5).comment("Other leave balance")
      table.decimal("long_leave", 10, 2).defaultTo(90).comment("Long leave balance")
      table.decimal("maternity_leave", 10, 2).defaultTo(90).comment("Maternity leave balance")
      table.decimal("paternity_leave", 10, 2).defaultTo(14).comment("Paternity leave balance")
      table.decimal("marriage_leave", 10, 2).defaultTo(3).comment("Marriage leave balance")
      table.decimal("death_leave", 10, 2).defaultTo(2).comment("Death leave balance")
      table.decimal("hajj_umrah_leave", 10, 2).defaultTo(30).comment("Hajj/Umrah leave balance")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(["user_id"], "idx_leave_balance_user")
      table.index(["year"], "idx_leave_balance_year")
      table.unique(["user_id", "year"], "unq_leave_balance_user_year")
    })

    // Leave balance audit table
    .createTable("leave_balance_audit", (table) => {
      table.string("id", 36).primary().notNullable().comment("Audit record ID")
      table
        .string("leave_balance_id", 36)
        .notNullable()
        .references("id")
        .inTable("leave_balance")
        .onDelete("CASCADE")
        .comment("Leave balance ID")
      table
        .string("adjusted_by", 36)
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL")
        .comment("User ID who made the adjustment")
      table.string("adjustment_type").notNullable().comment("Type of leave adjusted")
      table.integer("adjustment_amount").notNullable().comment("Amount of adjustment")
      table.integer("previous_value").notNullable().comment("Value before adjustment")
      table.integer("new_value").notNullable().comment("Value after adjustment")
      table.text("notes").comment("Additional notes about the adjustment")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(["leave_balance_id"], "idx_leave_balance_audit_balance")
      table.index(["adjusted_by"], "idx_leave_balance_audit_user")
      table.index(["created_at"], "idx_leave_balance_audit_date")
    })
}

exports.down = async (knex) => {
  // Drop tables in reverse order
  await knex.schema.dropTableIfExists("leave_balance_audit")
  await knex.schema.dropTableIfExists("leave_balance")
  await knex.schema.dropTableIfExists("leave_approval_workflow")
  await knex.schema.dropTableIfExists("leave_requests")

  // Drop enum types
  await knex.raw("DROP TYPE IF EXISTS approval_status_type")
  await knex.raw("DROP TYPE IF EXISTS leave_status_type")
  await knex.raw("DROP TYPE IF EXISTS leave_type")

  return Promise.resolve()
} 