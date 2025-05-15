/**
 * Migration to update compensation table structure
 * - Remove currency field
 * - Add meal_allowance and positional_allowance fields
 * - Keep bonuses and deductions fields
 */
exports.up = async (knex) => {
  // Check if the table exists
  const tableExists = await knex.schema.hasTable("compensation")
  if (!tableExists) {
    console.log("Compensation table does not exist, skipping update")
    return Promise.resolve()
  }

  return knex.schema.alterTable("compensation", (table) => {
    // Remove currency field
    table.dropColumn("currency")
    
    // Add new allowance fields
    table.decimal("meal_allowance", 12, 2).defaultTo(0).comment("Meal allowance amount")
    table.decimal("positional_allowance", 12, 2).defaultTo(0).comment("Positional allowance amount")
  })
}

exports.down = async (knex) => {
  // Check if the table exists
  const tableExists = await knex.schema.hasTable("compensation")
  if (!tableExists) {
    console.log("Compensation table does not exist, skipping rollback")
    return Promise.resolve()
  }

  return knex.schema.alterTable("compensation", (table) => {
    // Add back currency field
    table.string("currency", 3).defaultTo("USD").comment("Currency code (e.g., USD, EUR)")
    
    // Remove allowance fields
    table.dropColumn("meal_allowance")
    table.dropColumn("positional_allowance")
  })
}
