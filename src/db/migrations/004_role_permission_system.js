/**
 * Role and Permission System migration
 * Implements a comprehensive role-permission system
 */
exports.up = async (knex) => {
  await knex.schema
    // Permissions table
    .createTable("permissions", (table) => {
      table.string("id", 36).primary().notNullable().comment("Permission ID")
      table.string("name", 100).notNullable().unique().comment("Permission name (e.g., view_users)")
      table.string("description", 255).nullable().comment("Description of what this permission allows")
      table.string("category", 100).nullable().comment("Category for grouping permissions")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    })

    // Roles table
    .createTable("roles", (table) => {
      table.string("id", 36).primary().notNullable().comment("Role ID")
      table.string("name", 100).notNullable().unique().comment("Role name (e.g., admin, hr)")
      table.string("display_name", 100).notNullable().comment("Display name for the role (e.g., Administrator)")
      table.string("description", 255).nullable().comment("Description of this role")
      table.boolean("is_system_role").notNullable().defaultTo(false).comment("Whether this is a system-defined role")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    })

    // Role permissions table (many-to-many)
    .createTable("role_permissions", (table) => {
      table.increments("id").primary().comment("Role permission mapping ID")
      table
        .string("role_id", 36)
        .notNullable()
        .references("id")
        .inTable("roles")
        .onDelete("CASCADE")
        .comment("Reference to role")
      table
        .string("permission_id", 36)
        .notNullable()
        .references("id")
        .inTable("permissions")
        .onDelete("CASCADE")
        .comment("Reference to permission")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      
      // Composite unique constraint
      table.unique(["role_id", "permission_id"])
    })

    // User roles table (many-to-many)
    .createTable("user_roles", (table) => {
      table.increments("id").primary().comment("User role mapping ID")
      table
        .string("user_id", 36)
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE")
        .comment("Reference to user")
      table
        .string("role_id", 36)
        .notNullable()
        .references("id")
        .inTable("roles")
        .onDelete("CASCADE")
        .comment("Reference to role")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      
      // Composite unique constraint
      table.unique(["user_id", "role_id"])
    })

  // Insert basic system roles that other migrations can rely on
  const basicRoles = [
    {
      id: "role_admin",
      name: "admin",
      display_name: "Administrator",
      description: "System administrator with full access",
      is_system_role: true
    },
    {
      id: "role_manager",
      name: "manager",
      display_name: "Manager",
      description: "Department manager with team management access",
      is_system_role: true
    },
    {
      id: "role_hr",
      name: "hr",
      display_name: "HR Specialist",
      description: "Human Resources specialist",
      is_system_role: true
    },
    {
      id: "role_hr_manager",
      name: "hr_manager",
      display_name: "HR Manager",
      description: "Human Resources manager with advanced HR access",
      is_system_role: true
    },
    {
      id: "role_payroll",
      name: "payroll",
      display_name: "Payroll Specialist",
      description: "Payroll specialist with payroll management access",
      is_system_role: true
    },
    {
      id: "role_employee",
      name: "employee",
      display_name: "Employee",
      description: "Regular employee",
      is_system_role: true
    }
  ];

  // Insert roles if they don't exist
  for (const role of basicRoles) {
    const existingRole = await knex("roles").where({ id: role.id }).first();
    if (!existingRole) {
      await knex("roles").insert(role);
      console.log(`✅ Created system role: ${role.name} (${role.id})`);
    }
  }
}

exports.down = async (knex) => {
  // Drop tables in reverse order
  await knex.schema.dropTableIfExists("user_roles")
  await knex.schema.dropTableIfExists("role_permissions")
  await knex.schema.dropTableIfExists("roles")
  await knex.schema.dropTableIfExists("permissions")
  
  return Promise.resolve()
} 