const bcrypt = require("bcryptjs")
const { generateId } = require("../../utils/idGenerator")

/**
 * Consolidated initial data seed
 * Creates admin user, departments, roles, and permissions
 */
exports.seed = async (knex) => {
  // Check if users table is empty
  const userCount = await knex("users").count("id as count").first()

  if (Number.parseInt(userCount.count) === 0) {
    // Create admin user
    const salt = await bcrypt.genSalt(12)
    const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123!Secure"
    const hashedPassword = await bcrypt.hash(adminPassword, salt)
    const userId = generateId()

    await knex("users").insert([
      {
        id: userId,
        name: "System Administrator",
        email: "admin@example.com",
        password: hashedPassword,
        role: "admin",
        department: "Administration",
        position: "System Administrator",
        active: true,
        is_owner: true,
      },
    ])

    console.log("Created admin user")
  }

  // Create departments
  const deptCount = await knex("departments").count("id as count").first()
  if (Number.parseInt(deptCount.count) === 0) {
    const departments = [
      {
        id: generateId("", 2),
        name: "Administration",
        description: "Administrative department responsible for overall management",
      },
      {
        id: generateId("", 3),
        name: "Human Resources",
        description: "Responsible for recruiting, onboarding, and employee relations",
      },
      {
        id: generateId("", 4),
        name: "Engineering",
        description: "Software development and technical operations",
      },
      {
        id: generateId("", 5),
        name: "Marketing",
        description: "Marketing, advertising, and brand management",
      },
      {
        id: generateId("", 6),
        name: "Sales",
        description: "Sales and customer acquisition",
      },
      {
        id: generateId("", 7),
        name: "Finance",
        description: "Financial planning, accounting, and reporting",
      },
      {
        id: generateId("", 8),
        name: "Customer Support",
        description: "Customer service and technical support",
      },
    ]

    await knex("departments").insert(departments)
    console.log("Created departments")
  }

  // Create roles
  const roleCount = await knex("roles").count("id as count").first()
  if (Number.parseInt(roleCount.count) === 0) {
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

    await knex("roles").insert(roles)
    console.log("Created roles")
  }

  // Create permissions
  const permissionCount = await knex("permissions").count("id as count").first()
  if (Number.parseInt(permissionCount.count) === 0) {
    const permissions = [
      // Dashboard
      { id: "perm_view_dashboard", name: "view_dashboard", description: "View dashboard", category: "dashboard" },
      
      // User management
      { id: "perm_view_users", name: "view_users", description: "View user list", category: "users" },
      { id: "perm_create_users", name: "create_users", description: "Create new users", category: "users" },
      { id: "perm_edit_users", name: "edit_users", description: "Edit existing users", category: "users" },
      { id: "perm_delete_users", name: "delete_users", description: "Delete users", category: "users" },
      
      // Attendance
      { id: "perm_view_attendance", name: "view_attendance", description: "View attendance records", category: "attendance" },
      { id: "perm_manage_attendance", name: "manage_attendance", description: "Manage attendance (generate QR codes)", category: "attendance" },
      { id: "perm_record_attendance", name: "record_attendance", description: "Record own attendance", category: "attendance" },
      
      // Leave
      { id: "perm_view_leave", name: "view_leave", description: "View leave requests", category: "leave" },
      { id: "perm_request_leave", name: "request_leave", description: "Request leave", category: "leave" },
      { id: "perm_approve_leave", name: "approve_leave", description: "Approve leave requests", category: "leave" },
      
      // Organization
      { id: "perm_view_organization", name: "view_organization", description: "View organization structure", category: "organization" },
      { id: "perm_manage_organization", name: "manage_organization", description: "Manage organization structure", category: "organization" },
      
      // Core HR
      { id: "perm_view_core_hr", name: "view_core_hr", description: "View core HR data", category: "core_hr" },
      { id: "perm_manage_core_hr", name: "manage_core_hr", description: "Manage core HR data", category: "core_hr" },
      
      // Master data
      { id: "perm_view_master_data", name: "view_master_data", description: "View master data", category: "master_data" },
      { id: "perm_manage_master_data", name: "manage_master_data", description: "Manage master data", category: "master_data" },
      
      // Payroll
      { id: "perm_view_payroll", name: "view_payroll", description: "View payroll data", category: "payroll" },
      { id: "perm_manage_payroll", name: "manage_payroll", description: "Manage payroll", category: "payroll" },
      
      // Documents
      { id: "perm_view_documents", name: "view_documents", description: "View documents", category: "documents" },
      { id: "perm_manage_documents", name: "manage_documents", description: "Manage documents", category: "documents" },
      
      // Compensation
      { id: "perm_view_compensation", name: "view_compensation", description: "View compensation data", category: "compensation" },
      { id: "perm_manage_compensation", name: "manage_compensation", description: "Manage compensation", category: "compensation" },
      
      // Reports
      { id: "perm_view_reports", name: "view_reports", description: "View reports", category: "reports" },
      { id: "perm_generate_reports", name: "generate_reports", description: "Generate reports", category: "reports" }
    ]

    await knex("permissions").insert(permissions)
    console.log("Created permissions")

    // Create role-permission mappings
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
      
      // Manager permissions (includes employee permissions)
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
    ]

    // Add HR Manager permissions (combination of HR and Manager)
    const hrPermissions = rolePermissions.filter(rp => rp.role_id === "role_hr").map(rp => rp.permission_id)
    const managerPermissions = rolePermissions.filter(rp => rp.role_id === "role_manager").map(rp => rp.permission_id)
    const hrManagerPermissions = [...new Set([...hrPermissions, ...managerPermissions])]
    
    hrManagerPermissions.forEach(permissionId => {
      rolePermissions.push({ role_id: "role_hr_manager", permission_id: permissionId })
    })

    await knex("role_permissions").insert(rolePermissions)
    console.log("Created role-permission mappings")

    // Assign admin role to admin user
    const adminUser = await knex("users").where({ email: "admin@example.com" }).first()
    if (adminUser) {
      await knex("user_roles").insert({
        user_id: adminUser.id,
        role_id: "role_admin"
      })
      console.log("Assigned admin role to admin user")
    }
  }

  // Check if job_positions table has data
  const jobPositionsCount = await knex('job_positions').count('id as count').first()
  
  if (parseInt(jobPositionsCount.count) === 0) {
    const jobPositions = [
      { id: "pos_ceo", name: "CEO", code: "CEO", description: "Chief Executive Officer", level: "executive", min_salary: 150000, max_salary: 300000 },
      { id: "pos_cto", name: "CTO", code: "CTO", description: "Chief Technology Officer", level: "executive", department: "Engineering", min_salary: 130000, max_salary: 250000 },
      { id: "pos_cfo", name: "CFO", code: "CFO", description: "Chief Financial Officer", level: "executive", department: "Finance", min_salary: 120000, max_salary: 240000 },
      { id: "pos_hrd", name: "HR Director", code: "HRD", description: "Human Resources Director", level: "executive", department: "Human Resources", min_salary: 100000, max_salary: 180000 },
      { id: "pos_mkd", name: "Marketing Director", code: "MKD", description: "Marketing Director", level: "executive", department: "Marketing", min_salary: 90000, max_salary: 170000 },
      { id: "pos_sdev", name: "Senior Developer", code: "SDEV", description: "Senior Software Developer", level: "senior", department: "Engineering", min_salary: 80000, max_salary: 130000 },
      { id: "pos_jdev", name: "Junior Developer", code: "JDEV", description: "Junior Software Developer", level: "entry", department: "Engineering", min_salary: 45000, max_salary: 70000 },
      { id: "pos_fana", name: "Financial Analyst", code: "FANA", description: "Financial Analyst", level: "mid", department: "Finance", min_salary: 55000, max_salary: 85000 },
      { id: "pos_hrsp", name: "HR Specialist", code: "HRSP", description: "Human Resources Specialist", level: "mid", department: "Human Resources", min_salary: 50000, max_salary: 75000 },
      { id: "pos_srep", name: "Sales Representative", code: "SREP", description: "Sales Representative", level: "mid", department: "Sales", min_salary: 40000, max_salary: 70000 },
      { id: "pos_pm", name: "Product Manager", code: "PM", description: "Product Manager", level: "senior", department: "Engineering", min_salary: 85000, max_salary: 140000 },
      { id: "pos_uxd", name: "UX Designer", code: "UXD", description: "User Experience Designer", level: "mid", department: "Design", min_salary: 60000, max_salary: 95000 },
      { id: "pos_se", name: "Software Engineer", code: "SE", description: "Software Engineer", level: "mid", department: "Engineering", min_salary: 65000, max_salary: 95000 },
      { id: "pos_ms", name: "Marketing Specialist", code: "MS", description: "Marketing Specialist", level: "mid", department: "Marketing", min_salary: 45000, max_salary: 70000 },
      { id: "pos_cs", name: "Customer Support", code: "CS", description: "Customer Support Representative", level: "entry", department: "Support", min_salary: 35000, max_salary: 55000 },
    ]
    
    await knex('job_positions').insert(jobPositions)
    console.log(`✅ Inserted ${jobPositions.length} job positions`)
  }

  return Promise.resolve()
} 