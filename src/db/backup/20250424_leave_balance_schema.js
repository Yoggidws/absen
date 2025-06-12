/**
 * Migration to create leave_balance table
 */
exports.up = async (knex) => {
  // Check if the table already exists to avoid errors
  const tableExists = await knex.schema.hasTable("leave_balance")
  if (tableExists) {
    console.log("Leave balance table already exists, skipping creation")
    return Promise.resolve()
  }

  return knex.schema.createTable("leave_balance", (table) => {
    table.string("id", 36).primary().notNullable().comment("Leave balance ID")
    table
      .string("user_id", 36)
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE")
      .comment("User ID")
    table.integer("year").notNullable().comment("Year for this balance")
    table.integer("total_allowance").notNullable().defaultTo(20).comment("Total annual leave allowance in days")
    table.integer("used_days").notNullable().defaultTo(0).comment("Number of days used")
    table.integer("remaining_days").notNullable().defaultTo(20).comment("Number of days remaining")
    table.integer("carried_over").notNullable().defaultTo(0).comment("Days carried over from previous year")
    table.integer("sick_allowance").notNullable().defaultTo(10).comment("Sick leave allowance in days")
    table.integer("sick_used").notNullable().defaultTo(0).comment("Sick leave days used")
    table.integer("personal_allowance").notNullable().defaultTo(5).comment("Personal leave allowance in days")
    table.integer("personal_used").notNullable().defaultTo(0).comment("Personal leave days used")
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Indexes
    table.index(["user_id"], "idx_leave_balance_user")
    table.index(["year"], "idx_leave_balance_year")
    table.unique(["user_id", "year"], "unq_leave_balance_user_year")
  })
}

exports.down = async (knex) => {
  return knex.schema.dropTableIfExists("leave_balance")
}
