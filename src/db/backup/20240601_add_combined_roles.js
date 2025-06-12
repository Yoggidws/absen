/**
 * Migration to add combined roles to user_role_type enum
 * Adds hr_manager role to the user_role_type enum
 */
exports.up = async (knex) => {
  try {
    // First, check if the enum type exists
    const enumExists = await knex.raw(`SELECT 1 FROM pg_type WHERE typname = 'user_role_type'`)
    
    if (enumExists.rows.length > 0) {
      // Alter the enum type to add new values
      // We need to create a new type, update the column to use it, and then drop the old type
      
      // 1. Create a new enum type with all values including the combined role
      await knex.raw(`CREATE TYPE user_role_type_new AS ENUM ('admin', 'manager', 'employee', 'hr', 'payroll', 'hr_manager')`)
      
      // 2. First, drop the default constraint
      await knex.raw(`ALTER TABLE users ALTER COLUMN role DROP DEFAULT`)
      
      // 3. Update the column to use the new type
      await knex.raw(`
        ALTER TABLE users 
        ALTER COLUMN role TYPE user_role_type_new 
        USING role::text::user_role_type_new
      `)
      
      // 4. Add back the default constraint with the new type
      await knex.raw(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'employee'::user_role_type_new`)
      
      // 5. Drop the old type
      await knex.raw(`DROP TYPE user_role_type`)
      
      // 6. Rename the new type to the original name
      await knex.raw(`ALTER TYPE user_role_type_new RENAME TO user_role_type`)
      
      console.log('Successfully updated user_role_type enum with combined roles')
    } else {
      console.log('user_role_type enum not found, skipping migration')
    }
    
    return Promise.resolve()
  } catch (error) {
    console.error('Error updating user roles:', error)
    return Promise.reject(error)
  }
}

exports.down = async (knex) => {
  try {
    // Revert the enum type to previous values (without combined roles)
    
    // 1. Create a new enum type with values excluding combined roles
    await knex.raw(`CREATE TYPE user_role_type_old AS ENUM ('admin', 'manager', 'employee', 'hr', 'payroll')`)
    
    // 2. First, drop the default constraint
    await knex.raw(`ALTER TABLE users ALTER COLUMN role DROP DEFAULT`)
    
    // 3. Update the column to use the old type
    // This might fail if there are rows with the combined role values
    await knex.raw(`
      ALTER TABLE users 
      ALTER COLUMN role TYPE user_role_type_old 
      USING (
        CASE 
          WHEN role::text = 'hr_manager' THEN 'hr'::text
          ELSE role::text
        END
      )::user_role_type_old
    `)
    
    // 4. Add back the default constraint with the old type
    await knex.raw(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'employee'::user_role_type_old`)
    
    // 5. Drop the current type
    await knex.raw(`DROP TYPE user_role_type`)
    
    // 6. Rename the old type to the original name
    await knex.raw(`ALTER TYPE user_role_type_old RENAME TO user_role_type`)
    
    console.log('Successfully reverted user_role_type enum')
    return Promise.resolve()
  } catch (error) {
    console.error('Error reverting user roles:', error)
    return Promise.reject(error)
  }
}
