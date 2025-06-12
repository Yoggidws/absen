/**
 * Migration to implement a role-permission system
 * Creates tables for permissions, roles, role_permissions, and user_roles
 */
exports.up = async (knex) => {
  try {
    // Create permissions table
    await knex.schema.createTable("permissions", (table) => {
      table.string("id", 36).primary().notNullable().comment("Permission ID")
      table.string("name", 100).notNullable().unique().comment("Permission name (e.g., view_users)")
      table.string("description", 255).nullable().comment("Description of what this permission allows")
      table.string("category", 100).nullable().comment("Category for grouping permissions")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    })

    // Create roles table
    await knex.schema.createTable("roles", (table) => {
      table.string("id", 36).primary().notNullable().comment("Role ID")
      table.string("name", 100).notNullable().unique().comment("Role name (e.g., admin, hr)")
      table.string("display_name", 100).notNullable().comment("Display name for the role (e.g., Administrator)")
      table.string("description", 255).nullable().comment("Description of this role")
      table.boolean("is_system_role").notNullable().defaultTo(false).comment("Whether this is a system-defined role")
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    })

    // Create role_permissions table (many-to-many)
    await knex.schema.createTable("role_permissions", (table) => {
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

    // Create user_roles table (many-to-many)
    await knex.schema.createTable("user_roles", (table) => {
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

    // Migrate existing user roles to the new system
    // First, create the standard roles
    const roles = [
      {
        id: "role_admin",
        name: "admin",
        display_name: "Administrator",
        description: "Full access to all system features",
        is_system_role: true
      },
      {
        id: "role_manager",
        name: "manager",
        display_name: "Manager",
        description: "Department manager with approval capabilities",
        is_system_role: true
      },
      {
        id: "role_hr",
        name: "hr",
        display_name: "HR",
        description: "Human Resources staff with access to HR features",
        is_system_role: true
      },
      {
        id: "role_payroll",
        name: "payroll",
        display_name: "Payroll",
        description: "Payroll staff with access to compensation features",
        is_system_role: true
      },
      {
        id: "role_employee",
        name: "employee",
        display_name: "Employee",
        description: "Basic employee access",
        is_system_role: true
      },
      {
        id: "role_hr_manager",
        name: "hr_manager",
        display_name: "HR Manager",
        description: "Combined HR and Manager role",
        is_system_role: true
      }
    ]

    // Insert roles
    await knex("roles").insert(roles)

    // Get all users
    const users = await knex("users").select("id", "role")

    // Map old roles to new roles and insert into user_roles
    const userRoles = []
    for (const user of users) {
      let roleId
      switch (user.role) {
        case "admin":
          roleId = "role_admin"
          break
        case "manager":
          roleId = "role_manager"
          break
        case "hr":
          roleId = "role_hr"
          break
        case "payroll":
          roleId = "role_payroll"
          break
        case "hr_manager":
          // For hr_manager, add both hr and manager roles
          userRoles.push({ user_id: user.id, role_id: "role_hr" })
          roleId = "role_manager"
          break
        default:
          roleId = "role_employee"
      }
      userRoles.push({ user_id: user.id, role_id: roleId })
    }

    // Insert user roles
    if (userRoles.length > 0) {
      await knex("user_roles").insert(userRoles)
    }

    console.log('Successfully created role-permission system tables')
    return Promise.resolve()
  } catch (error) {
    console.error('Error creating role-permission system:', error)
    return Promise.reject(error)
  }
}

exports.down = async (knex) => {
  try {
    // Drop tables in reverse order
    await knex.schema.dropTableIfExists("user_roles")
    await knex.schema.dropTableIfExists("role_permissions")
    await knex.schema.dropTableIfExists("roles")
    await knex.schema.dropTableIfExists("permissions")
    
    console.log('Successfully dropped role-permission system tables')
    return Promise.resolve()
  } catch (error) {
    console.error('Error dropping role-permission system tables:', error)
    return Promise.reject(error)
  }
}
