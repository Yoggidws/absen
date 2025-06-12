/**
 * Migration to enhance compensation table structure
 * - Add transport_allowance field
 * - Keep meal_allowance and positional_allowance fields
 * - Remove bonuses and deductions fields
 */
exports.up = async (knex) => {
  // Check if the table exists
  const tableExists = await knex.schema.hasTable("compensation")
  if (!tableExists) {
    console.log("Compensation table does not exist, skipping update")
    return Promise.resolve()
  }

  return knex.schema.alterTable("compensation", (table) => {
    // Add transport allowance field
    table.decimal("transport_allowance", 12, 2).defaultTo(0).comment("Transport allowance amount")
    
    // Remove bonuses and deductions fields
    table.dropColumn("bonuses")
    table.dropColumn("deductions")
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
    // Remove transport allowance field
    table.dropColumn("transport_allowance")
    
    // Add back bonuses and deductions fields
    table.jsonb("bonuses").nullable().comment("JSON array of bonuses")
    table.jsonb("deductions").nullable().comment("JSON array of deductions")
  })
}
