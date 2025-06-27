exports.up = async function (knex) {
  return knex.schema.createTable("audit_logs", (table) => {
    table.string("id", 36).primary().notNullable().comment("Audit log ID");
    table.string("user_id", 36).references("id").inTable("users").onDelete("SET NULL").comment("User who performed the action");
    table.string("action", 100).notNullable().comment("Action performed");
    table.string("resource", 100).notNullable().comment("Resource type affected");
    table.string("resource_id", 100).nullable().comment("ID of the affected resource");
    table.string("event", 100).nullable().comment("Event type");
    table.string("result", 50).nullable().comment("Result of the action");
    table.string("ip_address", 45).nullable().comment("IP address of the user");
    table.string("user_agent", 255).nullable().comment("User agent string");
    table.jsonb("details").nullable().comment("Additional details as JSON");
    table.timestamp("timestamp", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index(["user_id"], "idx_audit_user");
    table.index(["action"], "idx_audit_action");
    table.index(["resource", "resource_id"], "idx_audit_resource");
    table.index(["timestamp"], "idx_audit_timestamp");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists("audit_logs");
}; 