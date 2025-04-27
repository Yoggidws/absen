/**
 * Initial database schema migration with best practices
 */
exports.up = async (knex) => {
  // We don't need UUID extension anymore
  // await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')

  return (
    knex.schema
      // Users table
      .createTable("users", (table) => {
        table.string("id", 36).primary().notNullable().comment("User ID")
        table.string("name", 100).notNullable().comment("Full name of the user")
        table.string("email", 100).notNullable().unique().comment("Email address (used for login)")
        table.string("password", 100).notNullable().comment("Hashed password")
        table
          .enum("role", ["admin", "manager", "employee"], { useNative: true, enumName: "user_role_type" })
          .notNullable()
          .defaultTo("employee")
          .comment("User role for permission control")
        table.string("department", 100).nullable().comment("Department name")
        table.string("position", 100).nullable().comment("Job position/title")
        table.string("avatar", 255).nullable().comment("URL to user avatar image")
        table.boolean("active").notNullable().defaultTo(true).comment("Whether user account is active")
        table.string("reset_password_token", 100).nullable().comment("Token for password reset")
        table.timestamp("reset_password_expire", { useTz: true }).nullable().comment("Expiration time for reset token")
        table
          .timestamp("created_at", { useTz: true })
          .notNullable()
          .defaultTo(knex.fn.now())
          .comment("Record creation timestamp")
        table
          .timestamp("updated_at", { useTz: true })
          .notNullable()
          .defaultTo(knex.fn.now())
          .comment("Record last update timestamp")

        // Indexes
        table.index(["email"], "idx_users_email")
        table.index(["department"], "idx_users_department")
        table.index(["role"], "idx_users_role")
      })

      // Attendance table
      .createTable("attendance", (table) => {
        table.string("id", 36).primary().notNullable().comment("Attendance ID")
        table
          .string("user_id", 36)
          .notNullable()
          .references("id")
          .inTable("users")
          .onDelete("CASCADE")
          .comment("Reference to user")
        table
          .enum("type", ["check-in", "check-out"], { useNative: true, enumName: "attendance_type" })
          .notNullable()
          .comment("Type of attendance record")
        table
          .timestamp("timestamp", { useTz: true })
          .notNullable()
          .defaultTo(knex.fn.now())
          .comment("Time of check-in/check-out")
        table.string("qr_id", 50).notNullable().comment("QR code identifier used for this attendance")
        table.jsonb("location").nullable().comment("JSON with latitude and longitude")
        table.string("ip_address", 45).nullable().comment("IP address of the device used") // Changed from inet to string
        table.text("device_info").nullable().comment("Information about the device used")
        table
          .enum("status", ["valid", "suspicious", "invalid"], { useNative: true, enumName: "attendance_status_type" })
          .notNullable()
          .defaultTo("valid")
          .comment("Status of the attendance record")
        table.text("notes").nullable().comment("Additional notes or comments")
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

        // Indexes for efficient queries
        table.index(["user_id", "timestamp"], "idx_attendance_user_time")
        table.index(["qr_id"], "idx_attendance_qr")
        table.index(["timestamp"], "idx_attendance_time")
        table.index(["status"], "idx_attendance_status")
      })

      // Departments table
      .createTable("departments", (table) => {
        table.string("id", 36).primary().notNullable().comment("Department ID")
        table.string("name", 100).notNullable().unique().comment("Department name")
        table.text("description").nullable().comment("Department description")
        table
          .string("manager_id", 36)
          .nullable()
          .references("id")
          .inTable("users")
          .onDelete("SET NULL")
          .comment("Department manager")
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

        // Indexes
        table.index(["name"], "idx_departments_name")
      })

      // Leave requests table
      .createTable("leave_requests", (table) => {
        table.string("id", 36).primary().notNullable().comment("Leave request ID")
        table
          .string("user_id", 36)
          .notNullable()
          .references("id")
          .inTable("users")
          .onDelete("CASCADE")
          .comment("User requesting leave")
        table
          .enum("type", ["sick", "vacation", "personal", "other"], { useNative: true, enumName: "leave_type" })
          .notNullable()
          .comment("Type of leave")
        table.date("start_date").notNullable().comment("First day of leave")
        table.date("end_date").notNullable().comment("Last day of leave")
        table.text("reason").notNullable().comment("Reason for leave request")
        table
          .enum("status", ["pending", "approved", "rejected"], { useNative: true, enumName: "leave_status_type" })
          .notNullable()
          .defaultTo("pending")
          .comment("Status of leave request")
        table
          .string("approved_by", 36)
          .nullable()
          .references("id")
          .inTable("users")
          .onDelete("SET NULL")
          .comment("User who approved/rejected")
        table.text("approval_notes").nullable().comment("Notes from approver")
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

        // Indexes
        table.index(["user_id"], "idx_leave_user")
        table.index(["status"], "idx_leave_status")
        table.index(["start_date", "end_date"], "idx_leave_dates")
      })

      // Reports table
      .createTable("reports", (table) => {
        table.string("id", 36).primary().notNullable().comment("Report ID")
        table.string("name", 100).notNullable().comment("Report name")
        table
          .enum("type", ["daily", "weekly", "monthly", "custom"], { useNative: true, enumName: "report_type" })
          .notNullable()
          .comment("Report frequency type")
        table
          .enum("format", ["pdf", "excel", "csv"], { useNative: true, enumName: "report_format_type" })
          .notNullable()
          .defaultTo("pdf")
          .comment("Report file format")
        table.jsonb("date_range").notNullable().comment("JSON with start and end dates")
        table.jsonb("filters").nullable().comment("JSON with filter criteria")
        table
          .string("created_by", 36)
          .notNullable()
          .references("id")
          .inTable("users")
          .onDelete("CASCADE")
          .comment("User who created the report")
        table.string("file_url", 255).nullable().comment("URL to generated report file")
        table.boolean("is_scheduled").notNullable().defaultTo(false).comment("Whether report is scheduled")
        table.jsonb("schedule").nullable().comment("JSON with schedule information")
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

        // Indexes
        table.index(["created_by"], "idx_reports_creator")
        table.index(["type"], "idx_reports_type")
        table.index(["is_scheduled"], "idx_reports_scheduled")
      })
  )
}

exports.down = (knex) =>
  knex.schema
    .dropTableIfExists("reports")
    .dropTableIfExists("leave_requests")
    .dropTableIfExists("departments")
    .dropTableIfExists("attendance")
    .dropTableIfExists("users")
    .raw("DROP TYPE IF EXISTS report_format_type")
    .raw("DROP TYPE IF EXISTS report_type")
    .raw("DROP TYPE IF EXISTS leave_status_type")
    .raw("DROP TYPE IF EXISTS leave_type")
    .raw("DROP TYPE IF EXISTS attendance_status_type")
    .raw("DROP TYPE IF EXISTS attendance_type")
    .raw("DROP TYPE IF EXISTS user_role_type")
