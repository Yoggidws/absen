/**
 * Migration to create onboarding and offboarding tables
 */
exports.up = async (knex) => {
  // Check if enum type exists
  const enumExists = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM pg_type 
      WHERE typname = 'task_status_type'
    );
  `);

  // Create enum type if it doesn't exist
  if (!enumExists.rows[0].exists) {
    await knex.raw(`
      CREATE TYPE task_status_type AS ENUM ('pending', 'in_progress', 'completed')
    `);
  }

  // Create onboarding_tasks table
  await knex.schema.createTable("onboarding_tasks", (table) => {
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

  // Create offboarding_tasks table
  await knex.schema.createTable("offboarding_tasks", (table) => {
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

  // Try to drop enum type
  try {
    await knex.raw("DROP TYPE IF EXISTS task_status_type")
  } catch (error) {
    console.log("Error dropping task_status_type enum:", error.message)
  }

  return Promise.resolve()
} 