const { db } = require('../config/db');

/**
 * Maps the old role string from the `users` table to the new role ID
 * in the `roles` table.
 * @param {string} roleString - The role string (e.g., "admin", "manager").
 * @returns {string} The corresponding role ID (e.g., "role_admin").
 */
const getRoleIdFromRoleString = (roleString) => {
  switch (roleString?.toLowerCase()) {
    case "admin":
    case "administrator":
      return "role_admin";
    case "manager":
      return "role_manager";
    case "hr":
      return "role_hr";
    case "payroll":
      return "role_payroll";
    case "hr_manager":
      return "role_hr_manager";
    case "employee":
    default:
      return "role_employee";
  }
};

/**
 * Migrates existing users from the old text-based role system to the new
 * role-based access control (RBAC) system by populating the `user_roles` table.
 */
const migrateRoles = async () => {
  console.log('Starting user role migration...');
  try {
    // Find all users who do not have an entry in the user_roles table yet
    const usersToMigrate = await db('users as u')
      .leftJoin('user_roles as ur', 'u.id', 'ur.user_id')
      .whereNull('ur.user_id')
      .select('u.id', 'u.name', 'u.role');

    if (usersToMigrate.length === 0) {
      console.log('✅ All users already have assigned roles. No migration needed.');
      return;
    }

    console.log(`Found ${usersToMigrate.length} user(s) to migrate.`);

    let successCount = 0;
    let errorCount = 0;

    // Iterate over each user and assign them the correct role in the user_roles table
    for (const user of usersToMigrate) {
      const roleId = getRoleIdFromRoleString(user.role);
      try {
        await db('user_roles').insert({
          user_id: user.id,
          role_id: roleId,
        });
        console.log(`- Successfully assigned role '${roleId}' to user: ${user.name} (ID: ${user.id})`);
        successCount++;
      } catch (error) {
        // Handle potential duplicate key errors if the script is run more than once
        if (error.code === '23505') { // Unique violation error code in PostgreSQL
             console.log(`- User ${user.name} (ID: ${user.id}) already has a role assigned. Skipping.`);
             // This user is already migrated, so we can count it as a success for this run.
             successCount++;
        } else {
            console.error(`❌ Failed to assign role to user ${user.name} (ID: ${user.id}):`, error.message);
            errorCount++;
        }
      }
    }

    console.log('\nMigration summary:');
    console.log(`- ${successCount} user(s) migrated successfully.`);
    if (errorCount > 0) {
      console.log(`- ${errorCount} user(s) failed to migrate.`);
    }
    console.log('✅ Role migration complete.');

  } catch (error) {
    console.error('❌ An unexpected error occurred during role migration:', error);
  } finally {
    // Ensure the database connection is closed
    await db.destroy();
  }
};

// Execute the migration script
migrateRoles(); 