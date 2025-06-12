/**
 * Core database schema migration
 * Combines initial schema with core tables
 */
exports.up = async (knex) => {
  return knex.schema
    // Users table
    .createTable("users", (table) => {
      table.string("id", 36).primary().notNullable().comment("User ID")
      table.string("name", 100).notNullable().comment("Full name of the user")
      table.string("email", 100).notNullable().unique().comment("Email address (used for login)")
      table.string("password", 100).notNullable().comment("Hashed password")
      table
        .enum("role", ["admin", "manager", "employee", "hr", "payroll", "hr_manager"], { useNative: true, enumName: "user_role_type" })
        .notNullable()
        .defaultTo("employee")
        .comment("User role for permission control")
      table.string("department", 100).nullable().comment("Department name")
      table.string("position", 100).nullable().comment("Job position/title")
      table.string("avatar", 255).nullable().comment("URL to user avatar image")
      table.string("phone", 20).nullable().comment("User's phone number")
      table.string("emergency_contact", 20).nullable().comment("Emergency contact phone number")
      table.text("address").nullable().comment("User's address")
      table.boolean("active").notNullable().defaultTo(true).comment("Whether user account is active")
      table.boolean("is_owner").defaultTo(false).comment("Flag to identify the owner of the company")
      table.string("reset_password_token", 100).nullable().comment("Token for password reset")
      table.timestamp("reset_password_expire", { useTz: true }).nullable().comment("Expiration time for reset token")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Indexes
      table.index(["email"], "idx_users_email")
      table.index(["department"], "idx_users_department")
      table.index(["role"], "idx_users_role")
      table.index(["phone"], "idx_users_phone")
      table.index(["emergency_contact"], "idx_users_emergency")
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

      table.index(["name"], "idx_departments_name")
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
      table.string("ip_address", 45).nullable().comment("IP address of the device used")
      table.text("device_info").nullable().comment("Information about the device used")
      table
        .enum("status", ["valid", "suspicious", "invalid"], { useNative: true, enumName: "attendance_status_type" })
        .notNullable()
        .defaultTo("valid")
        .comment("Status of the attendance record")
      table.text("notes").nullable().comment("Additional notes or comments")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())

      table.index(["user_id", "timestamp"], "idx_attendance_user_time")
      table.index(["qr_id"], "idx_attendance_qr")
      table.index(["timestamp"], "idx_attendance_time")
      table.index(["status"], "idx_attendance_status")
    })

    // Documents table
    .createTable("documents", (table) => {
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

      table.index(["user_id"], "idx_documents_user")
      table.index(["type"], "idx_documents_type")
      table.index(["created_at"], "idx_documents_created_at")
    })

    // Announcements table
    .createTable("announcements", (table) => {
      table.string("id").primary().comment("ANN-XXXXXXX")
      table.string("title").notNullable()
      table.text("content").notNullable()
      table.string("user_id").notNullable().comment("User who created/updated")
      table
        .foreign("user_id")
        .references("id")
        .inTable("users")
        .onDelete("CASCADE")
      table.timestamps(true, true)
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

      table.index(["created_by"], "idx_reports_creator")
      table.index(["type"], "idx_reports_type")
      table.index(["is_scheduled"], "idx_reports_scheduled")
    })
}

exports.down = (knex) =>
  knex.schema
    .dropTableIfExists("reports")
    .dropTableIfExists("announcements")
    .dropTableIfExists("documents")
    .dropTableIfExists("attendance")
    .dropTableIfExists("departments")
    .dropTableIfExists("users")
    .raw("DROP TYPE IF EXISTS report_format_type")
    .raw("DROP TYPE IF EXISTS report_type")
    .raw("DROP TYPE IF EXISTS attendance_status_type")
    .raw("DROP TYPE IF EXISTS attendance_type")
    .raw("DROP TYPE IF EXISTS user_role_type") 