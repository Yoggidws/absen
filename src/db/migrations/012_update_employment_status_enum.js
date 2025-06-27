/**
 * Migration to add 'terminated' to employment_status_type enum
 */
exports.up = async (knex) => {
  // First, drop the default constraint and the enum check constraint
  await knex.raw(`
    ALTER TABLE employees 
    ALTER COLUMN employment_status DROP DEFAULT;
    
    ALTER TABLE employees 
    ALTER COLUMN employment_status TYPE VARCHAR(50);
  `)

  // Update the enum type
  await knex.raw(`
    DROP TYPE employment_status_type;
    CREATE TYPE employment_status_type AS ENUM ('permanent', 'contract', 'probation', 'intern', 'terminated');
  `)

  // Set the column back to use the enum type and add default
  await knex.raw(`
    ALTER TABLE employees 
    ALTER COLUMN employment_status TYPE employment_status_type USING employment_status::employment_status_type;
    
    ALTER TABLE employees 
    ALTER COLUMN employment_status SET DEFAULT 'permanent';
  `)
}

exports.down = async (knex) => {
  // First, drop the default constraint and the enum check constraint
  await knex.raw(`
    ALTER TABLE employees 
    ALTER COLUMN employment_status DROP DEFAULT;
    
    ALTER TABLE employees 
    ALTER COLUMN employment_status TYPE VARCHAR(50);
  `)

  // Revert any 'terminated' values to 'permanent'
  await knex.raw(`
    UPDATE employees 
    SET employment_status = 'permanent' 
    WHERE employment_status = 'terminated';
  `)

  // Recreate the original enum type
  await knex.raw(`
    DROP TYPE employment_status_type;
    CREATE TYPE employment_status_type AS ENUM ('permanent', 'contract', 'probation', 'intern');
  `)

  // Set the column back to use the enum type and add default
  await knex.raw(`
    ALTER TABLE employees 
    ALTER COLUMN employment_status TYPE employment_status_type USING employment_status::employment_status_type;
    
    ALTER TABLE employees 
    ALTER COLUMN employment_status SET DEFAULT 'permanent';
  `)
} 