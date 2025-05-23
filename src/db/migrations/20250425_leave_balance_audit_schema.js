/**
 * Migration to create leave_balance_audit table
 */
exports.up = async (knex) => {
  // Check if the table already exists to avoid errors
  const tableExists = await knex.schema.hasTable("leave_balance_audit")
  if (tableExists) {
    console.log("Leave balance audit table already exists, skipping creation")
    return Promise.resolve()
  }

  return knex.schema.createTable("leave_balance_audit", (table) => {
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
  return knex.schema.dropTableIfExists("leave_balance_audit")
} 