const { db } = require('./src/config/db');

async function checkAdminPermissions() {
  try {
    console.log('=== Checking Admin Permissions ===\n');

    // Find admin user
    const adminUser = await db('users')
      .where('email', 'admin@example.com')
      .select('id', 'name', 'email', 'role')
      .first();
    
    console.log('Admin User:', adminUser);

    if (adminUser) {
      // Check admin user roles
      const adminRoles = await db('user_roles')
        .where('user_id', adminUser.id)
        .join('roles', 'user_roles.role_id', 'roles.id')
        .select('roles.id', 'roles.name', 'roles.display_name');
      
      console.log('\nAdmin Roles:', adminRoles);

      // Check admin permissions
      const adminPermissions = await db('user_roles')
        .where('user_roles.user_id', adminUser.id)
        .join('roles', 'user_roles.role_id', 'roles.id')
        .join('role_permissions', 'roles.id', 'role_permissions.role_id')
        .join('permissions', 'role_permissions.permission_id', 'permissions.id')
        .select('permissions.id', 'permissions.name', 'permissions.description');
      
      console.log('\nAdmin Permissions (showing first 20):');
      adminPermissions.slice(0, 20).forEach(p => {
        console.log(`- ${p.name}: ${p.description}`);
      });

      console.log(`\nTotal permissions: ${adminPermissions.length}`);

      // Check specifically for role management permissions
      const rolePermissions = adminPermissions.filter(p => 
        p.name.includes('role') || p.name.includes('permission')
      );
      
      console.log('\nRole/Permission management permissions:');
      rolePermissions.forEach(p => {
        console.log(`- ${p.name}: ${p.description}`);
      });
    }

  } catch (error) {
    console.error('Permission check failed:', error);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

checkAdminPermissions(); 