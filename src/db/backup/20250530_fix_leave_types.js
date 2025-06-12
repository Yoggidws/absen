/**
 * Migration to fix leave types enum
 */
exports.up = async (knex) => {
  // First, check if the leave_requests table exists and what type the column has
  const tableExists = await knex.schema.hasTable('leave_requests');
  
  if (tableExists) {
    // Convert the type column to varchar first to remove any enum constraints
    await knex.raw(`
      ALTER TABLE leave_requests ALTER COLUMN type TYPE VARCHAR(50);
    `);

    // Drop the existing enum type if it exists
    const enumExists = await knex.raw(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'leave_type'
      );
    `);

    if (enumExists.rows[0].exists) {
      await knex.raw(`DROP TYPE leave_type CASCADE;`);
    }

    // Create new enum type with correct values
    await knex.raw(`
      CREATE TYPE leave_type AS ENUM (
        'annual',
        'sick', 
        'long',
        'maternity',
        'paternity',
        'marriage',
        'death',
        'hajj_umrah'
      );
    `);

    // Update any existing data to use the new leave types
    await knex.raw(`
      UPDATE leave_requests 
      SET type = CASE 
        WHEN type IN ('vacation', 'personal', 'other') THEN 'annual'
        WHEN type = 'sick' THEN 'sick'
        ELSE 'annual'
      END;
    `);

    // Now convert the column to use the new enum type
    await knex.raw(`
      ALTER TABLE leave_requests 
      ALTER COLUMN type TYPE leave_type 
      USING type::leave_type;
    `);
  }
};

exports.down = async (knex) => {
  const tableExists = await knex.schema.hasTable('leave_requests');
  
  if (tableExists) {
    // Convert back to varchar
    await knex.raw(`
      ALTER TABLE leave_requests ALTER COLUMN type TYPE VARCHAR(50);
    `);

    // Drop the new enum type
    await knex.raw(`DROP TYPE IF EXISTS leave_type CASCADE;`);

    // Create the old enum type
    await knex.raw(`
      CREATE TYPE leave_type AS ENUM ('sick', 'vacation', 'personal', 'other');
    `);

    // Convert data back to old format
    await knex.raw(`
      UPDATE leave_requests 
      SET type = CASE 
        WHEN type = 'annual' THEN 'vacation'
        WHEN type = 'sick' THEN 'sick'
        WHEN type IN ('long', 'maternity', 'paternity', 'marriage', 'death', 'hajj_umrah') THEN 'other'
        ELSE 'other'
      END;
    `);

    // Convert the column back to the old enum type
    await knex.raw(`
      ALTER TABLE leave_requests 
      ALTER COLUMN type TYPE leave_type 
      USING type::leave_type;
    `);
  }
}; 