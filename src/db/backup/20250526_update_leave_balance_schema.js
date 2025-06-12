/**
 * Migration to update leave balance table structure
 * - Simplify the schema to match frontend needs
 * - Convert to annual_leave, sick_leave, other_leave structure
 */
exports.up = async (knex) => {
  // Check if the table exists
  const tableExists = await knex.schema.hasTable("leave_balance")
  if (!tableExists) {
    console.log("Leave balance table does not exist, skipping update")
    return Promise.resolve()
  }

  // First, drop the foreign key constraint from leave_balance_audit
  await knex.schema.table("leave_balance_audit", (table) => {
    table.dropForeign("leave_balance_id")
  })

  // Create a backup of the existing data
  await knex.schema.createTable("leave_balance_backup", (table) => {
    table.string("id", 36).primary().notNullable()
    table.string("user_id", 36).notNullable()
    table.integer("year").notNullable()
    table.integer("total_allowance").notNullable()
    table.integer("used_days").notNullable()
    table.integer("remaining_days").notNullable()
    table.integer("carried_over").notNullable()
    table.integer("sick_allowance").notNullable()
    table.integer("sick_used").notNullable()
    table.integer("personal_allowance").notNullable()
    table.integer("personal_used").notNullable()
    table.timestamp("created_at", { useTz: true }).notNullable()
    table.timestamp("updated_at", { useTz: true }).notNullable()
  })

  // Copy existing data to backup
  await knex.raw("INSERT INTO leave_balance_backup SELECT * FROM leave_balance")

  // Drop the existing table
  await knex.schema.dropTable("leave_balance")

  // Create the new table with updated schema
  await knex.schema.createTable("leave_balance", (table) => {
    table.string("id", 36).primary().notNullable().comment("Leave balance ID")
    table
      .string("user_id", 36)
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE")
      .comment("User ID")
    table.integer("year").notNullable().comment("Year for this balance")
    table.integer("annual_leave").notNullable().defaultTo(20).comment("Annual leave balance")
    table.integer("sick_leave").notNullable().defaultTo(10).comment("Sick leave balance")
    table.integer("other_leave").notNullable().defaultTo(5).comment("Other leave balance")
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Indexes
    table.index(["user_id"], "idx_leave_balance_user")
    table.index(["year"], "idx_leave_balance_year")
    table.unique(["user_id", "year"], "unq_leave_balance_user_year")
  })

  // Migrate data from backup to new schema
  const backupData = await knex("leave_balance_backup").select("*")
  for (const record of backupData) {
    await knex("leave_balance").insert({
      id: record.id,
      user_id: record.user_id,
      year: record.year,
      annual_leave: record.remaining_days,
      sick_leave: record.sick_allowance - record.sick_used,
      other_leave: record.personal_allowance - record.personal_used,
      created_at: record.created_at,
      updated_at: record.updated_at
    })
  }

  // Re-add the foreign key constraint to leave_balance_audit
  await knex.schema.table("leave_balance_audit", (table) => {
    table.foreign("leave_balance_id").references("id").inTable("leave_balance").onDelete("CASCADE")
  })

  // Drop the backup table
  return knex.schema.dropTable("leave_balance_backup")
}

exports.down = async (knex) => {
  // Check if the table exists
  const tableExists = await knex.schema.hasTable("leave_balance")
  if (!tableExists) {
    console.log("Leave balance table does not exist, skipping rollback")
    return Promise.resolve()
  }

  // First, drop the foreign key constraint from leave_balance_audit
  await knex.schema.table("leave_balance_audit", (table) => {
    table.dropForeign("leave_balance_id")
  })

  // Create a backup of the existing data
  await knex.schema.createTable("leave_balance_backup", (table) => {
    table.string("id", 36).primary().notNullable()
    table.string("user_id", 36).notNullable()
    table.integer("year").notNullable()
    table.integer("annual_leave").notNullable()
    table.integer("sick_leave").notNullable()
    table.integer("other_leave").notNullable()
    table.timestamp("created_at", { useTz: true }).notNullable()
    table.timestamp("updated_at", { useTz: true }).notNullable()
  })

  // Copy existing data to backup
  await knex.raw("INSERT INTO leave_balance_backup SELECT * FROM leave_balance")

  // Drop the existing table
  await knex.schema.dropTable("leave_balance")

  // Create the original table structure
  await knex.schema.createTable("leave_balance", (table) => {
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

  // Migrate data back from backup
  const backupData = await knex("leave_balance_backup").select("*")
  for (const record of backupData) {
    await knex("leave_balance").insert({
      id: record.id,
      user_id: record.user_id,
      year: record.year,
      total_allowance: record.annual_leave,
      used_days: 0,
      remaining_days: record.annual_leave,
      carried_over: 0,
      sick_allowance: record.sick_leave,
      sick_used: 0,
      personal_allowance: record.other_leave,
      personal_used: 0,
      created_at: record.created_at,
      updated_at: record.updated_at
    })
  }

  // Re-add the foreign key constraint to leave_balance_audit
  await knex.schema.table("leave_balance_audit", (table) => {
    table.foreign("leave_balance_id").references("id").inTable("leave_balance").onDelete("CASCADE")
  })

  // Drop the backup table
  return knex.schema.dropTable("leave_balance_backup")
} 