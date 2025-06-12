/**
 * Migration to create compensation table
 */
exports.up = async (knex) => {
  // Check if the table already exists to avoid errors
  const tableExists = await knex.schema.hasTable("compensation")
  if (tableExists) {
    console.log("Compensation table already exists, skipping creation")
    return Promise.resolve()
  }

  return knex.schema.createTable("compensation", (table) => {
    table.string("id", 36).primary().notNullable().comment("Compensation ID")
    table
      .string("user_id", 36)
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE")
      .comment("User this compensation record belongs to")
    table.decimal("base_salary", 12, 2).notNullable().comment("Base salary amount")
    table.string("currency", 3).notNullable().defaultTo("USD").comment("Currency code (e.g., USD, EUR)")
    table.date("effective_date").notNullable().comment("Date when this salary becomes effective")
    table.jsonb("bonuses").nullable().comment("JSON array of bonuses")
    table.jsonb("deductions").nullable().comment("JSON array of deductions")
    table.text("notes").nullable().comment("Additional notes")
    table
      .string("created_by", 36)
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL")
      .comment("User who created this record")
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Indexes
    table.index(["user_id"], "idx_compensation_user")
    table.index(["effective_date"], "idx_compensation_effective_date")
  })
}

exports.down = async (knex) => {
  return knex.schema.dropTableIfExists("compensation")
}
