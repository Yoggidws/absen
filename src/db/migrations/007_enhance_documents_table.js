exports.up = async function (knex) {
  await knex.schema.alterTable("documents", (table) => {
    table.date("expiry_date").nullable();
    table.string("status", 50).defaultTo("active").notNullable();
  });

  // Add a check constraint for the status values
  await knex.raw(`
    ALTER TABLE documents
    ADD CONSTRAINT documents_status_check
    CHECK (status IN ('active', 'expired', 'archived', 'pending_review'));
  `);

  console.log("✅ Enhanced documents table with expiry_date and status columns.");
};

exports.down = async function (knex) {
  // Remove the check constraint first
  await knex.raw(`
    ALTER TABLE documents
    DROP CONSTRAINT documents_status_check;
  `);

  await knex.schema.alterTable("documents", (table) => {
    table.dropColumn("expiry_date");
    table.dropColumn("status");
  });

  console.log("Reverted documents table enhancement.");
}; 