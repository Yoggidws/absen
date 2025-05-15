/**
 * Migration to create employees table
 */
exports.up = async (knex) => {
  // Check if the table already exists to avoid errors
  const tableExists = await knex.schema.hasTable("employees")
  if (tableExists) {
    console.log("Employees table already exists, skipping creation")
    return Promise.resolve()
  }

  return knex.schema.createTable("employees", (table) => {
    table.string("employee_id", 36).primary().notNullable().comment("Employee ID")
    table.string("full_name", 100).notNullable().comment("Full name of the employee")
    table.enum("gender", ["male", "female", "other"], { useNative: true, enumName: "gender_type" })
      .notNullable()
      .comment("Gender of the employee")
    table.string("place_of_birth", 100).notNullable().comment("Place of birth")
    table.date("date_of_birth").notNullable().comment("Date of birth")
    table.text("address").notNullable().comment("Current address")
    table.string("phone_number", 20).notNullable().comment("Contact phone number")
    table.string("email", 100).notNullable().unique().comment("Email address")
    table.enum("marital_status", ["single", "married", "divorced", "widowed"], { useNative: true, enumName: "marital_status_type" })
      .notNullable()
      .comment("Marital status")
    table.integer("number_of_children").notNullable().defaultTo(0).comment("Number of children")
    table.string("position", 100).notNullable().comment("Job position/title")
    table.string("department", 100).notNullable().comment("Department name")
    table
      .string("department_id", 36)
      .references("id")
      .inTable("departments")
      .onDelete("SET NULL")
      .comment("Reference to department")
    table.date("hire_date").notNullable().comment("Date of employment")
    table.enum("employment_status", ["permanent", "contract", "probation", "intern"], { useNative: true, enumName: "employment_status_type" })
      .notNullable()
      .defaultTo("permanent")
      .comment("Employment status")
    table.decimal("basic_salary", 12, 2).notNullable().comment("Basic salary amount")
    table.decimal("allowance", 12, 2).notNullable().defaultTo(0).comment("Additional allowance amount")
    table.string("profile_picture", 255).nullable().comment("URL to profile picture")
    table
      .string("user_id", 36)
      .unique()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL")
      .comment("Reference to user account")
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Indexes
    table.index(["department_id"], "idx_employees_department")
    table.index(["user_id"], "idx_employees_user")
    table.index(["hire_date"], "idx_employees_hire_date")
    table.index(["employment_status"], "idx_employees_status")
  })
}

exports.down = async (knex) => {
  // Drop the table and enum types
  await knex.schema.dropTableIfExists("employees")

  // Try to drop enum types
  try {
    await knex.raw("DROP TYPE IF EXISTS gender_type")
    await knex.raw("DROP TYPE IF EXISTS marital_status_type")
    await knex.raw("DROP TYPE IF EXISTS employment_status_type")
  } catch (error) {
    console.log("Error dropping enum types:", error.message)
  }

  return Promise.resolve()
}
