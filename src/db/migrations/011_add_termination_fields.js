/**
 * Migration to add termination fields to employees table
 */
exports.up = async (knex) => {
  return knex.schema.alterTable("employees", (table) => {
    table.date("termination_date").nullable().comment("Date of employment termination")
    table.text("termination_reason").nullable().comment("Reason for employment termination")
    
    // Add index for termination date
    table.index(["termination_date"], "idx_employees_termination_date")
  })
}

exports.down = async (knex) => {
  return knex.schema.alterTable("employees", (table) => {
    table.dropColumn("termination_date")
    table.dropColumn("termination_reason")
  })
} 