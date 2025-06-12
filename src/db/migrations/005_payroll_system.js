/**
 * Payroll System migration
 * Creates payroll periods and items tables
 */
exports.up = async (knex) => {
  // Create enum types for payroll
  await knex.raw(`CREATE TYPE payroll_period_status AS ENUM ('draft', 'pending', 'approved', 'paid', 'cancelled')`)
  await knex.raw(`CREATE TYPE payroll_item_status AS ENUM ('pending', 'approved', 'paid', 'cancelled')`)

  return knex.schema
    // Payroll periods table
    .createTable("payroll_periods", (table) => {
      table.string("id", 36).primary().notNullable().comment("Payroll period ID")
      table.integer("month").notNullable().comment("Month (1-12)")
      table.integer("year").notNullable().comment("Year")
      table.string("name", 100).notNullable().comment("Period name (e.g., 'January 2023')")
      table.date("start_date").notNullable().comment("Period start date")
      table.date("end_date").notNullable().comment("Period end date")
      table
        .specificType("status", "payroll_period_status")
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

    // Payroll items table
    .createTable("payroll_items", (table) => {
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
        .specificType("status", "payroll_item_status")
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

exports.down = async (knex) => {
  // Drop tables if they exist
  await knex.schema.dropTableIfExists("payroll_items")
  await knex.schema.dropTableIfExists("payroll_periods")

  // Drop enum types
  await knex.raw("DROP TYPE IF EXISTS payroll_item_status")
  await knex.raw("DROP TYPE IF EXISTS payroll_period_status")

  return Promise.resolve()
} 