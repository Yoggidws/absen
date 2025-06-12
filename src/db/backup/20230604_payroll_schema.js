/**
 * Migration to create payroll tables
 */
exports.up = async (knex) => {
  // Check if tables already exist to avoid errors
  const payrollPeriodsExists = await knex.schema.hasTable("payroll_periods")
  const payrollItemsExists = await knex.schema.hasTable("payroll_items")

  if (payrollPeriodsExists && payrollItemsExists) {
    console.log("Payroll tables already exist, skipping creation")
    return Promise.resolve()
  }

  // Create enum types if they don't exist
  try {
    // Check if the enum types already exist
    const periodStatusExists = await knex.raw(`SELECT 1 FROM pg_type WHERE typname = 'payroll_period_status'`)
    const itemStatusExists = await knex.raw(`SELECT 1 FROM pg_type WHERE typname = 'payroll_item_status'`)

    // Create the enum types if they don't exist
    if (periodStatusExists.rows.length === 0) {
      await knex.raw(`CREATE TYPE payroll_period_status AS ENUM ('draft', 'pending', 'approved', 'paid', 'cancelled')`)
    }

    if (itemStatusExists.rows.length === 0) {
      await knex.raw(`CREATE TYPE payroll_item_status AS ENUM ('pending', 'approved', 'paid', 'cancelled')`)
    }
  } catch (error) {
    console.log("Error creating enum types:", error.message)
    // Continue with migration even if enum creation fails
  }

  // Create payroll_periods table if it doesn't exist
  if (!payrollPeriodsExists) {
    await knex.schema.createTable("payroll_periods", (table) => {
      table.string("id", 36).primary().notNullable().comment("Payroll period ID")
      table.integer("month").notNullable().comment("Month (1-12)")
      table.integer("year").notNullable().comment("Year")
      table.string("name", 100).notNullable().comment("Period name (e.g., 'January 2023')")
      table.date("start_date").notNullable().comment("Period start date")
      table.date("end_date").notNullable().comment("Period end date")
      table
        .enum("status", ["draft", "pending", "approved", "paid", "cancelled"], {
          useNative: true,
          enumName: "payroll_period_status",
          existingType: true,
        })
        .notNullable()
        .defaultTo("draft")
        .comment("Payroll period status")
      table.string("created_by", 36).notNullable().references("id").inTable("users").onDelete("SET NULL")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(["year", "month"], "idx_payroll_periods_year_month")
      table.index(["status"], "idx_payroll_periods_status")
    })
  }

  // Create payroll_items table if it doesn't exist
  if (!payrollItemsExists) {
    return knex.schema.createTable("payroll_items", (table) => {
      table.string("id", 36).primary().notNullable().comment("Payroll item ID")
      table
        .string("payroll_period_id", 36)
        .notNullable()
        .references("id")
        .inTable("payroll_periods")
        .onDelete("CASCADE")
      table.string("user_id", 36).notNullable().references("id").inTable("users").onDelete("CASCADE")
      table.decimal("base_salary", 12, 2).notNullable().comment("Base salary amount")
      table.decimal("bonuses", 12, 2).notNullable().defaultTo(0).comment("Total bonuses")
      table.decimal("deductions", 12, 2).notNullable().defaultTo(0).comment("Total deductions")
      table.decimal("absence_deduction", 12, 2).notNullable().defaultTo(0).comment("Deduction for absences")
      table.decimal("gross_salary", 12, 2).notNullable().comment("Gross salary (base + bonuses)")
      table.decimal("net_salary", 12, 2).notNullable().comment("Net salary (gross - deductions)")
      table.integer("working_days").notNullable().comment("Total working days in period")
      table.integer("present_days").notNullable().defaultTo(0).comment("Days present")
      table.integer("absent_days").notNullable().defaultTo(0).comment("Days absent")
      table.integer("paid_leave_days").notNullable().defaultTo(0).comment("Paid leave days")
      table.integer("unpaid_leave_days").notNullable().defaultTo(0).comment("Unpaid leave days")
      table
        .enum("status", ["pending", "approved", "paid", "cancelled"], {
          useNative: true,
          enumName: "payroll_item_status",
          existingType: true,
        })
        .notNullable()
        .defaultTo("pending")
        .comment("Payroll item status")
      table.string("currency", 3).notNullable().defaultTo("USD").comment("Currency code")
      table.timestamp("payment_date", { useTz: true }).nullable().comment("Date of payment")
      table.string("payment_method", 50).nullable().comment("Payment method")
      table.string("payment_reference", 100).nullable().comment("Payment reference number")
      table.jsonb("details").nullable().comment("Additional details as JSON")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(["payroll_period_id"], "idx_payroll_items_period")
      table.index(["user_id"], "idx_payroll_items_user")
      table.index(["status"], "idx_payroll_items_status")
      table.unique(["payroll_period_id", "user_id"], "unq_payroll_period_user")
    })
  }

  return Promise.resolve()
}

exports.down = async (knex) => {
  // Drop tables if they exist
  await knex.schema.dropTableIfExists("payroll_items")
  await knex.schema.dropTableIfExists("payroll_periods")

  // Try to drop enum types
  try {
    await knex.raw("DROP TYPE IF EXISTS payroll_item_status")
    await knex.raw("DROP TYPE IF EXISTS payroll_period_status")
  } catch (error) {
    console.log("Error dropping enum types:", error.message)
  }

  return Promise.resolve()
}
