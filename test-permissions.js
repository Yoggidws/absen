const { db } = require('./src/config/db');
const { fetchUserRolesAndPermissions } = require('./src/middlewares/permissionMiddleware');

async function checkUserPermissions() {
  try {
    console.log('=== Testing User Permissions ===\n');
    
    const user = await db('users').where('email', 'admin@example.com').first();
    console.log('User found:', user ? user.name : 'Not found');
    
    if (user) {
      console.log('User ID:', user.id);
      console.log('Legacy Role:', user.role);
      
      const authData = await fetchUserRolesAndPermissions(user.id);
      console.log('\nAuth Data:');
      console.log('Roles:', authData.roles);
      console.log('Permissions:', authData.permissions);
      
      // Check specific permissions
      const hasReadAttendanceOwn = authData.permissions.includes('read:attendance:own');
      const hasReadAttendanceAll = authData.permissions.includes('read:attendance:all');
      const isAdmin = authData.roles.includes('admin') || user.role === 'admin';
      
      console.log('\nPermission Check:');
      console.log('Has read:attendance:own:', hasReadAttendanceOwn);
      console.log('Has read:attendance:all:', hasReadAttendanceAll);
      console.log('Is Admin:', isAdmin);
      
      console.log('\nShould be able to access attendance history:', 
        hasReadAttendanceOwn || hasReadAttendanceAll || isAdmin);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

checkUserPermissions(); 