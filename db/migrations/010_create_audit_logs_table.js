exports.up = async function (knex) {
  await knex.schema.createTable("audit_logs", (table) => {
    table.string("id", 50).primary()
    table.timestamp("timestamp").defaultTo(knex.fn.now())
    table.string("user_id").references("id").inTable("users").onDelete("SET NULL")
    table.string("action", 255).notNullable()
    table.string("resource", 255)
    table.string("resource_id", 255)
    table.string("event", 100)
    table.string("result", 100)
    table.jsonb("details")
    table.string("ip_address", 50)
    table.text("user_agent")

    table.index("user_id")
    table.index("action")
    table.index("resource")
    table.index("timestamp")
  })
  console.log("✅ Created audit_logs table")
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("audit_logs")
  console.log("Reverted audit_logs table creation")
} 