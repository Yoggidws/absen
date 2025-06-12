exports.seed = async function (knex) {
  // 1. TRUNCATE existing tables to ensure a clean slate
  // The order is important to avoid foreign key constraint issues
  await knex("role_permissions").del()
  await knex("user_roles").del()
  await knex("permissions").del()
  await knex("roles").del()

  // 2. DEFINE Permissions
  // Format: action:resource:scope (e.g., read:user:own)
  const permissions = [
    // Announcements
    { id: "perm_create_announcement", name: "create:announcement", description: "Can create new announcements" },
    { id: "perm_read_announcement", name: "read:announcement", description: "Can read announcements" },
    { id: "perm_update_announcement", name: "update:announcement", description: "Can update announcements" },
    { id: "perm_delete_announcement", name: "delete:announcement", description: "Can delete announcements" },
    
    // Attendance
    { id: "perm_read_attendance_own", name: "read:attendance:own", description: "Can read own attendance records" },
    { id: "perm_read_attendance_all", name: "read:attendance:all", description: "Can read all attendance records" },
    { id: "perm_manage_attendance", name: "manage:attendance", description: "Can manage attendance (e.g., generate QR)" },
    
    // Users & Profile
    { id: "perm_create_user", name: "create:user", description: "Can create new users" },
    { id: "perm_read_user", name: "read:user", description: "Can read user data" },
    { id: "perm_read_user_all", name: "read:user:all", description: "Can read all user data" },
    { id: "perm_update_user", name: "update:user", description: "Can update user data" },
    { id: "perm_delete_user", name: "delete:user", description: "Can delete users" },
    { id: "perm_read_profile_own", name: "read:profile:own", description: "Can read own profile" },
    { id: "perm_update_profile_own", name: "update:profile:own", description: "Can update own profile" },
    
    // Departments
    { id: "perm_create_department", name: "create:department", description: "Can create departments" },
    { id: "perm_read_department", name: "read:department", description: "Can read department data" },
    { id: "perm_update_department", name: "update:department", description: "Can update departments" },
    { id: "perm_delete_department", name: "delete:department", description: "Can delete departments" },
    
    // Documents
    { id: "perm_upload_document_own", name: "upload:document:own", description: "Can upload own documents" },
    { id: "perm_read_document_own", name: "read:document:own", description: "Can read own documents" },
    { id: "perm_update_document_own", name: "update:document:own", description: "Can update own documents" },
    { id: "perm_delete_document_own", name: "delete:document:own", description: "Can delete own documents" },
    { id: "perm_upload_document_all", name: "upload:document:all", description: "Can upload all documents" },
    { id: "perm_read_document_all", name: "read:document:all", description: "Can read all documents" },
    { id: "perm_update_document_all", name: "update:document:all", description: "Can update all documents" },
    { id: "perm_delete_document_all", name: "delete:document:all", description: "Can delete all documents" },
    
    // Compensation
    { id: "perm_read_compensation_own", name: "read:compensation:own", description: "Can read own compensation" },
    { id: "perm_read_compensation_all", name: "read:compensation:all", description: "Can read all compensations" },
    { id: "perm_create_compensation", name: "create:compensation", description: "Can create compensation records" },
    { id: "perm_update_compensation", name: "update:compensation", description: "Can update compensation records" },
    { id: "perm_delete_compensation", name: "delete:compensation", description: "Can delete compensation records" },
    
    // Payroll
    { id: "perm_read_payroll_own", name: "read:payroll:own", description: "Can read own payroll data" },
    { id: "perm_read_payroll_all", name: "read:payroll:all", description: "Can read all payroll data" },
    { id: "perm_manage_payroll", name: "manage:payroll", description: "Can manage payroll processes" },
    
    // Reports
    { id: "perm_generate_report", name: "generate:report", description: "Can generate reports" },
    { id: "perm_read_report", name: "read:report", description: "Can read reports" },
    
    // Leave
    { id: "perm_create_leave_request", name: "create:leave_request", description: "Can create own leave requests" },
    { id: "perm_read_leave_request_own", name: "read:leave_request:own", description: "Can read own leave requests" },
    { id: "perm_cancel_leave_request", name: "cancel:leave_request", description: "Can cancel own leave requests" },
    { id: "perm_read_leave_request_all", name: "read:leave_request:all", description: "Can read all leave requests" },
    { id: "perm_approve_leave_request", name: "approve:leave_request", description: "Can approve leave requests" },
    
    // Roles & Permissions Management
    { id: "perm_create_role", name: "create:role", category: "Role Management", description: "Can create new roles" },
    { id: "perm_read_role", name: "read:role", category: "Role Management", description: "Can read role data" },
    { id: "perm_update_role", name: "update:role", category: "Role Management", description: "Can update roles" },
    { id: "perm_delete_role", name: "delete:role", category: "Role Management", description: "Can delete roles" },
    { id: "perm_update_user_role", name: "update:user_role", category: "Role Management", description: "Can assign/unassign roles to users" },

    // Permission Management (New)
    { id: "perm_create_permission", name: "create:permission", category: "Permission Management", description: "Can create new permissions" },
    { id: "perm_read_permission", name: "read:permission", category: "Permission Management", description: "Can read permission data" },
    { id: "perm_update_permission", name: "update:permission", category: "Permission Management", description: "Can update permissions" },
    { id: "perm_delete_permission", name: "delete:permission", category: "Permission Management", description: "Can delete permissions" }
  ]
  await knex("permissions").insert(permissions)

  // 3. DEFINE Roles - Use lowercase names that match the role field in users table
  const roles = [
    { id: "role_employee", name: "employee", display_name: "Employee", description: "Default role for all users." },
    { id: "role_manager", name: "manager", display_name: "Manager", description: "Role for users who manage teams or departments." },
    { id: "role_hr", name: "hr", display_name: "HR", description: "Role for Human Resources staff." },
    { id: "role_payroll", name: "payroll", display_name: "Payroll", description: "Role for payroll processing staff." },
    { id: "role_admin", name: "admin", display_name: "Admin", description: "System administrator with high-level access." },
  ]
  await knex("roles").insert(roles)

  // 4. MAP Permissions to Roles
  const rolePermissions = {
    employee: [
      "read:announcement",
      "read:attendance:own",
      "read:profile:own",
      "update:profile:own",
      "read:department",
      "upload:document:own",
      "read:document:own",
      "update:document:own",
      "delete:document:own",
      "read:compensation:own",
      "read:payroll:own",
      "create:leave_request",
      "read:leave_request:own",
      "cancel:leave_request",
    ],
    manager: [
      "read:attendance:all", // Scope should be applied in logic (e.g., only for their department)
      "read:user", // Scope for their department
      "read:user:all", // Scope for their department
      "approve:leave_request", // Scope for their department
      "read:leave_request:all",
    ],
    hr: [
      "create:user",
      "read:user",
      "read:user:all",
      "update:user",
      "create:department",
      "read:department",
      "update:department",
      "read:document:all",
      "update:document:all",
      "delete:document:all",
      "upload:document:all",
      "read:compensation:all",
      "create:compensation",
      "update:compensation",
      "delete:compensation",
      "generate:report",
      "read:report",
      "read:leave_request:all",
      "approve:leave_request",
    ],
    payroll: [
      "read:payroll:all",
      "manage:payroll",
      "read:compensation:all",
      "generate:report",
    ],
    admin: [
      // Admin gets all permissions
      ...permissions.map((p) => p.name),
    ],
  }

  // Inherit permissions: Manager gets Employee permissions, HR gets Employee permissions
  rolePermissions.manager = [...new Set([...rolePermissions.employee, ...rolePermissions.manager])]
  rolePermissions.hr = [...new Set([...rolePermissions.employee, ...rolePermissions.hr])]

  // Flatten the mapping for insertion
  const rolePermissionsToInsert = []
  for (const roleName in rolePermissions) {
    const roleId = roles.find((r) => r.name === roleName).id
    const perms = rolePermissions[roleName]
    
    for (const permName of perms) {
      const permId = permissions.find((p) => p.name === permName).id
      if (roleId && permId) {
        rolePermissionsToInsert.push({ role_id: roleId, permission_id: permId })
      }
    }
  }

  // Insert the role-permission mappings
  if (rolePermissionsToInsert.length > 0) {
    await knex("role_permissions").insert(rolePermissionsToInsert)
  }

  // 5. ASSIGN ROLES TO EXISTING USERS
  // Find all users that don't have roles assigned yet
  const usersWithoutRoles = await knex.raw(`
    SELECT u.id, u.email, u.role, u.name
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    WHERE ur.user_id IS NULL
  `)

  const userRoleAssignments = []
  
  for (const user of usersWithoutRoles.rows || []) {
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
        // For hr_manager, assign both hr and manager roles
        userRoleAssignments.push({ user_id: user.id, role_id: "role_hr" })
        roleId = "role_manager"
        break
      default:
        roleId = "role_employee"
    }
    
    userRoleAssignments.push({ user_id: user.id, role_id: roleId })
    console.log(`Assigned role ${roleId} to user: ${user.name} (${user.email})`)
  }

  // Insert user role assignments
  if (userRoleAssignments.length > 0) {
    await knex("user_roles").insert(userRoleAssignments)
    console.log(`✅ Assigned roles to ${userRoleAssignments.length} users`)
  }

  console.log("✅ RBAC: Roles and permissions seeded successfully.")
} 