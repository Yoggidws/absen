/**
 * Seed file to create permissions and assign them to roles
 */
exports.seed = async (knex) => {
  // Check if permissions already exist
  const permissionCount = await knex("permissions").count("id as count").first()
  
  if (Number.parseInt(permissionCount.count) === 0) {
    // Define permissions by category
    const permissions = [
      // Dashboard permissions
      {
        id: "perm_view_dashboard",
        name: "view_dashboard",
        description: "View dashboard",
        category: "dashboard"
      },
      
      // User management permissions
      {
        id: "perm_view_users",
        name: "view_users",
        description: "View user list",
        category: "users"
      },
      {
        id: "perm_create_users",
        name: "create_users",
        description: "Create new users",
        category: "users"
      },
      {
        id: "perm_edit_users",
        name: "edit_users",
        description: "Edit existing users",
        category: "users"
      },
      {
        id: "perm_delete_users",
        name: "delete_users",
        description: "Delete users",
        category: "users"
      },
      
      // Attendance permissions
      {
        id: "perm_view_attendance",
        name: "view_attendance",
        description: "View attendance records",
        category: "attendance"
      },
      {
        id: "perm_manage_attendance",
        name: "manage_attendance",
        description: "Manage attendance (generate QR codes)",
        category: "attendance"
      },
      {
        id: "perm_record_attendance",
        name: "record_attendance",
        description: "Record own attendance",
        category: "attendance"
      },
      
      // Leave permissions
      {
        id: "perm_view_leave",
        name: "view_leave",
        description: "View leave requests",
        category: "leave"
      },
      {
        id: "perm_request_leave",
        name: "request_leave",
        description: "Request leave",
        category: "leave"
      },
      {
        id: "perm_approve_leave",
        name: "approve_leave",
        description: "Approve leave requests",
        category: "leave"
      },
      
      // Organization permissions
      {
        id: "perm_view_organization",
        name: "view_organization",
        description: "View organization structure",
        category: "organization"
      },
      {
        id: "perm_manage_organization",
        name: "manage_organization",
        description: "Manage organization structure",
        category: "organization"
      },
      
      // Core HR permissions
      {
        id: "perm_view_core_hr",
        name: "view_core_hr",
        description: "View core HR data",
        category: "core_hr"
      },
      {
        id: "perm_manage_core_hr",
        name: "manage_core_hr",
        description: "Manage core HR data",
        category: "core_hr"
      },
      
      // Master data permissions
      {
        id: "perm_view_master_data",
        name: "view_master_data",
        description: "View master data",
        category: "master_data"
      },
      {
        id: "perm_manage_master_data",
        name: "manage_master_data",
        description: "Manage master data",
        category: "master_data"
      },
      
      // Payroll permissions
      {
        id: "perm_view_payroll",
        name: "view_payroll",
        description: "View payroll data",
        category: "payroll"
      },
      {
        id: "perm_manage_payroll",
        name: "manage_payroll",
        description: "Manage payroll",
        category: "payroll"
      },
      
      // Document permissions
      {
        id: "perm_view_documents",
        name: "view_documents",
        description: "View documents",
        category: "documents"
      },
      {
        id: "perm_manage_documents",
        name: "manage_documents",
        description: "Manage documents",
        category: "documents"
      },
      
      // Compensation permissions
      {
        id: "perm_view_compensation",
        name: "view_compensation",
        description: "View compensation data",
        category: "compensation"
      },
      {
        id: "perm_manage_compensation",
        name: "manage_compensation",
        description: "Manage compensation",
        category: "compensation"
      },
      
      // Reports permissions
      {
        id: "perm_view_reports",
        name: "view_reports",
        description: "View reports",
        category: "reports"
      },
      {
        id: "perm_generate_reports",
        name: "generate_reports",
        description: "Generate reports",
        category: "reports"
      }
    ]
    
    // Insert permissions
    await knex("permissions").insert(permissions)
    
    // Define role-permission mappings based on requirements
    const rolePermissions = [
      // Admin has all permissions
      ...permissions.map(p => ({ role_id: "role_admin", permission_id: p.id })),
      
      // Employee permissions
      { role_id: "role_employee", permission_id: "perm_view_dashboard" },
      { role_id: "role_employee", permission_id: "perm_view_attendance" },
      { role_id: "role_employee", permission_id: "perm_record_attendance" },
      { role_id: "role_employee", permission_id: "perm_view_leave" },
      { role_id: "role_employee", permission_id: "perm_request_leave" },
      { role_id: "role_employee", permission_id: "perm_view_documents" },
      
      // Manager permissions
      { role_id: "role_manager", permission_id: "perm_view_dashboard" },
      { role_id: "role_manager", permission_id: "perm_view_attendance" },
      { role_id: "role_manager", permission_id: "perm_record_attendance" },
      { role_id: "role_manager", permission_id: "perm_view_leave" },
      { role_id: "role_manager", permission_id: "perm_request_leave" },
      { role_id: "role_manager", permission_id: "perm_approve_leave" },
      { role_id: "role_manager", permission_id: "perm_view_documents" },
      
      // HR permissions
      { role_id: "role_hr", permission_id: "perm_view_dashboard" },
      { role_id: "role_hr", permission_id: "perm_view_attendance" },
      { role_id: "role_hr", permission_id: "perm_record_attendance" },
      { role_id: "role_hr", permission_id: "perm_view_leave" },
      { role_id: "role_hr", permission_id: "perm_request_leave" },
      { role_id: "role_hr", permission_id: "perm_approve_leave" },
      { role_id: "role_hr", permission_id: "perm_view_documents" },
      { role_id: "role_hr", permission_id: "perm_view_users" },
      { role_id: "role_hr", permission_id: "perm_create_users" },
      { role_id: "role_hr", permission_id: "perm_edit_users" },
      { role_id: "role_hr", permission_id: "perm_view_organization" },
      { role_id: "role_hr", permission_id: "perm_manage_organization" },
      { role_id: "role_hr", permission_id: "perm_view_core_hr" },
      { role_id: "role_hr", permission_id: "perm_manage_core_hr" },
      { role_id: "role_hr", permission_id: "perm_view_master_data" },
      { role_id: "role_hr", permission_id: "perm_manage_master_data" },
      
      // Payroll permissions
      { role_id: "role_payroll", permission_id: "perm_view_dashboard" },
      { role_id: "role_payroll", permission_id: "perm_view_attendance" },
      { role_id: "role_payroll", permission_id: "perm_record_attendance" },
      { role_id: "role_payroll", permission_id: "perm_view_leave" },
      { role_id: "role_payroll", permission_id: "perm_request_leave" },
      { role_id: "role_payroll", permission_id: "perm_approve_leave" },
      { role_id: "role_payroll", permission_id: "perm_view_documents" },
      { role_id: "role_payroll", permission_id: "perm_view_users" },
      { role_id: "role_payroll", permission_id: "perm_view_organization" },
      { role_id: "role_payroll", permission_id: "perm_view_master_data" },
      { role_id: "role_payroll", permission_id: "perm_manage_master_data" },
      { role_id: "role_payroll", permission_id: "perm_view_payroll" },
      { role_id: "role_payroll", permission_id: "perm_manage_payroll" },
      { role_id: "role_payroll", permission_id: "perm_view_compensation" },
      { role_id: "role_payroll", permission_id: "perm_manage_compensation" },
      
      // HR Manager has combined permissions of HR and Manager
      // (These will be added programmatically below)
    ]
    
    // Add HR Manager permissions (combination of HR and Manager)
    const hrPermissions = rolePermissions.filter(rp => rp.role_id === "role_hr").map(rp => rp.permission_id)
    const managerPermissions = rolePermissions.filter(rp => rp.role_id === "role_manager").map(rp => rp.permission_id)
    
    // Combine permissions, removing duplicates
    const hrManagerPermissions = [...new Set([...hrPermissions, ...managerPermissions])]
    
    // Add HR Manager role permissions
    hrManagerPermissions.forEach(permissionId => {
      rolePermissions.push({ role_id: "role_hr_manager", permission_id: permissionId })
    })
    
    // Insert role permissions
    await knex("role_permissions").insert(rolePermissions)
    
    console.log(`Inserted ${permissions.length} permissions and ${rolePermissions.length} role-permission mappings`)
  } else {
    console.log("Permissions already exist, skipping seed")
  }
  
  return Promise.resolve()
}
