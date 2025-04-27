/**
 * Migration to create documents table
 */
exports.up = async (knex) => {
  // Check if the table already exists to avoid errors
  const tableExists = await knex.schema.hasTable("documents")
  if (tableExists) {
    console.log("Documents table already exists, skipping creation")
    return Promise.resolve()
  }

  return knex.schema.createTable("documents", (table) => {
    table.string("id", 36).primary().notNullable().comment("Document ID")
    table
      .string("user_id", 36)
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE")
      .comment("User who owns this document")
    table
      .string("uploaded_by", 36)
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL")
      .comment("User who uploaded this document")
    table.string("title", 255).notNullable().comment("Document title")
    table.text("description").nullable().comment("Document description")
    table.string("type", 50).notNullable().comment("Document type (e.g., contract, policy)")
    table.string("file_path", 255).notNullable().comment("Path to the file on server")
    table.string("file_name", 255).notNullable().comment("Original file name")
    table.string("file_type", 100).notNullable().comment("File MIME type")
    table.bigint("file_size").notNullable().comment("File size in bytes")
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Indexes
    table.index(["user_id"], "idx_documents_user")
    table.index(["type"], "idx_documents_type")
    table.index(["created_at"], "idx_documents_created_at")
  })
}

exports.down = async (knex) => {
  return knex.schema.dropTableIfExists("documents")
}
