const { db } = require('./src/config/db');

async function checkDatabase() {
  try {
    console.log('=== Checking Database State ===\n');

    // Check admin user
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
        .select('roles.name', 'roles.display_name');
      
      console.log('Admin Roles:', adminRoles);

      // Check admin permissions
      const adminPermissions = await db('user_roles')
        .where('user_roles.user_id', adminUser.id)
        .join('roles', 'user_roles.role_id', 'roles.id')
        .join('role_permissions', 'roles.id', 'role_permissions.role_id')
        .join('permissions', 'role_permissions.permission_id', 'permissions.id')
        .select('permissions.name')
        .limit(10);
      
      console.log('Admin Permissions (first 10):', adminPermissions.map(p => p.name));
    }

    // Check if required permissions exist
    const requiredPermissions = [
      'read:profile:own',
      'read:attendance:all'
    ];

    for (const perm of requiredPermissions) {
      const exists = await db('permissions')
        .where('name', perm)
        .select('id', 'name')
        .first();
      
      console.log(`Permission "${perm}" exists:`, !!exists);
    }

  } catch (error) {
    console.error('Database check failed:', error);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

checkDatabase(); 