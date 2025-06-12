exports.up = function (knex) {
  return knex.schema.createTable("announcements", function (table) {
    table.string("id").primary() // ANN-XXXXXXX
    table.string("title").notNullable()
    table.text("content").notNullable()
    table.string("user_id").notNullable() // User who created/updated
    table
      .foreign("user_id")
      .references("id")
      .inTable("users")
      .onDelete("CASCADE")
    table.timestamps(true, true)
  })
}

exports.down = function (knex) {
  return knex.schema.dropTable("announcements")
} 