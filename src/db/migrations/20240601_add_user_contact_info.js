/**
 * Add contact information fields to users table
 */
exports.up = async (knex) => {
  return knex.schema.alterTable("users", (table) => {
    table.string("phone", 20).nullable().comment("User's phone number")
    table.string("emergency_contact", 20).nullable().comment("Emergency contact phone number")
    table.text("address").nullable().comment("User's address")

    // Add indexes for the new fields
    table.index(["phone"], "idx_users_phone")
    table.index(["emergency_contact"], "idx_users_emergency")
  })
}

exports.down = async (knex) => {
  return knex.schema.alterTable("users", (table) => {
    table.dropIndex(["phone"], "idx_users_phone")
    table.dropIndex(["emergency_contact"], "idx_users_emergency")
    table.dropColumn("phone")
    table.dropColumn("emergency_contact")
    table.dropColumn("address")
  })
} 