/**
 * Migration to add owner flag to users table
 */
exports.up = async (knex) => {
  // Add is_owner column to users table
  await knex.schema.table("users", (table) => {
    table.boolean("is_owner").defaultTo(false).comment("Flag to identify the owner of the company");
  });
};

exports.down = async (knex) => {
  // Remove is_owner column from users table
  await knex.schema.table("users", (table) => {
    table.dropColumn("is_owner");
  });
}; 