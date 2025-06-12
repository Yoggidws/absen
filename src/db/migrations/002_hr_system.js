/**
 * HR System migration
 * Combines employees, compensation, and onboarding/offboarding features
 */
exports.up = async (knex) => {
  // Create enum types
  await knex.raw(`CREATE TYPE gender_type AS ENUM ('male', 'female', 'other')`)
  await knex.raw(`CREATE TYPE marital_status_type AS ENUM ('single', 'married', 'divorced', 'widowed')`)
  await knex.raw(`CREATE TYPE employment_status_type AS ENUM ('permanent', 'contract', 'probation', 'intern')`)
  await knex.raw(`CREATE TYPE task_status_type AS ENUM ('pending', 'in_progress', 'completed')`)

  return knex.schema
    // Job positions/titles table
    .createTable("job_positions", (table) => {
      table.string("id", 36).primary().notNullable().comment("Job position ID")
      table.string("name", 100).notNullable().unique().comment("Position name")
      table.string("code", 20).notNullable().unique().comment("Position code")
      table.text("description").nullable().comment("Position description")
      table.string("level", 50).nullable().comment("Position level (entry, mid, senior, executive)")
      table.string("department", 100).nullable().comment("Default department for this position")
      table.decimal("min_salary", 12, 2).nullable().comment("Minimum salary for this position")
      table.decimal("max_salary", 12, 2).nullable().comment("Maximum salary for this position")
      table.boolean("active").notNullable().defaultTo(true).comment("Whether this position is active")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(["name"], "idx_job_positions_name")
      table.index(["code"], "idx_job_positions_code")
      table.index(["active"], "idx_job_positions_active")
    })

    // Employees table
    .createTable("employees", (table) => {
      table.string("employee_id", 36).primary().notNullable().comment("Employee ID")
      table.string("full_name", 100).notNullable().comment("Full name of the employee")
      table.specificType("gender", "gender_type").notNullable().comment("Gender of the employee")
      table.string("place_of_birth", 100).notNullable().comment("Place of birth")
      table.date("date_of_birth").notNullable().comment("Date of birth")
      table.text("address").notNullable().comment("Current address")
      table.string("phone_number", 20).notNullable().comment("Contact phone number")
      table.string("email", 100).notNullable().unique().comment("Email address")
      table.specificType("marital_status", "marital_status_type").notNullable().comment("Marital status")
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
      table.specificType("employment_status", "employment_status_type").notNullable().defaultTo("permanent").comment("Employment status")
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

    // Compensation table
    .createTable("compensation", (table) => {
      table.string("id", 36).primary().notNullable().comment("Compensation ID")
      table
        .string("user_id", 36)
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE")
        .comment("User this compensation record belongs to")
      table.decimal("base_salary", 12, 2).notNullable().comment("Base salary amount")
      table.date("effective_date").notNullable().comment("Date when this salary becomes effective")
      table.decimal("meal_allowance", 12, 2).defaultTo(0).comment("Meal allowance amount")
      table.decimal("positional_allowance", 12, 2).defaultTo(0).comment("Positional allowance amount")
      table.decimal("transport_allowance", 12, 2).defaultTo(0).comment("Transport allowance amount")
      table.text("notes").nullable().comment("Additional notes")
      table
        .string("created_by", 36)
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL")
        .comment("User who created this record")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(["user_id"], "idx_compensation_user")
      table.index(["effective_date"], "idx_compensation_effective_date")
    })

    // Onboarding tasks table
    .createTable("onboarding_tasks", (table) => {
      table.string("id", 36).primary().notNullable().comment("Task ID")
      table
        .string("employee_id", 36)
        .notNullable()
        .references("employee_id")
        .inTable("employees")
        .onDelete("CASCADE")
        .comment("Employee being onboarded")
      table.string("task_name", 100).notNullable().comment("Name of the task")
      table.text("description").notNullable().comment("Task description")
      table
        .specificType("status", "task_status_type")
        .notNullable()
        .defaultTo("pending")
        .comment("Task status")
      table
        .string("assigned_to", 36)
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL")
        .comment("User assigned to complete the task")
      table.date("due_date").notNullable().comment("Task due date")
      table.text("notes").nullable().comment("Additional notes or comments")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(["employee_id"], "idx_onboarding_employee")
      table.index(["status"], "idx_onboarding_status")
      table.index(["assigned_to"], "idx_onboarding_assigned")
      table.index(["due_date"], "idx_onboarding_due_date")
    })

    // Offboarding tasks table
    .createTable("offboarding_tasks", (table) => {
      table.string("id", 36).primary().notNullable().comment("Task ID")
      table
        .string("employee_id", 36)
        .notNullable()
        .references("employee_id")
        .inTable("employees")
        .onDelete("CASCADE")
        .comment("Employee being offboarded")
      table.string("task_name", 100).notNullable().comment("Name of the task")
      table.text("description").notNullable().comment("Task description")
      table
        .specificType("status", "task_status_type")
        .notNullable()
        .defaultTo("pending")
        .comment("Task status")
      table
        .string("assigned_to", 36)
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL")
        .comment("User assigned to complete the task")
      table.date("due_date").notNullable().comment("Task due date")
      table.text("notes").nullable().comment("Additional notes or comments")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(["employee_id"], "idx_offboarding_employee")
      table.index(["status"], "idx_offboarding_status")
      table.index(["assigned_to"], "idx_offboarding_assigned")
      table.index(["due_date"], "idx_offboarding_due_date")
    })
}

exports.down = async (knex) => {
  // Drop tables in reverse order
  await knex.schema.dropTableIfExists("offboarding_tasks")
  await knex.schema.dropTableIfExists("onboarding_tasks")
  await knex.schema.dropTableIfExists("compensation")
  await knex.schema.dropTableIfExists("employees")
  await knex.schema.dropTableIfExists("job_positions")

  // Drop enum types
  await knex.raw("DROP TYPE IF EXISTS task_status_type")
  await knex.raw("DROP TYPE IF EXISTS employment_status_type")
  await knex.raw("DROP TYPE IF EXISTS marital_status_type")
  await knex.raw("DROP TYPE IF EXISTS gender_type")

  return Promise.resolve()
} 