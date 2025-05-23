/**
 * Migration to update leave types
 */
exports.up = async (knex) => {
  // First convert the leave_requests type column to varchar to safely handle the transition
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
    await knex.raw(`DROP TYPE leave_type;`);
  }

  // Create new enum type with updated values
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

  // Update existing leave types to match new enum values
  await knex.raw(`
    UPDATE leave_requests 
    SET type = CASE 
      WHEN type = 'vacation' THEN 'annual'
      WHEN type = 'personal' THEN 'annual'
      WHEN type = 'other' THEN 'annual'
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

  // Update leave_balance table to include new leave types
  await knex.schema.table('leave_balance', table => {
    table.decimal('long_leave', 10, 2).defaultTo(0);
    table.decimal('maternity_leave', 10, 2).defaultTo(0);
    table.decimal('paternity_leave', 10, 2).defaultTo(0);
    table.decimal('marriage_leave', 10, 2).defaultTo(0);
    table.decimal('death_leave', 10, 2).defaultTo(0);
    table.decimal('hajj_umrah_leave', 10, 2).defaultTo(0);
  });

  // Update existing leave balances
  await knex.raw(`
    UPDATE leave_balance 
    SET 
      long_leave = 90,
      maternity_leave = 90,
      paternity_leave = 14,
      marriage_leave = 3,
      death_leave = 2,
      hajj_umrah_leave = 30
    WHERE year = EXTRACT(YEAR FROM CURRENT_DATE);
  `);
};

exports.down = async (knex) => {
  // First convert the type column to varchar
  await knex.raw(`
    ALTER TABLE leave_requests ALTER COLUMN type TYPE VARCHAR(50);
  `);

  // Remove the new columns from leave_balance
  await knex.schema.table('leave_balance', table => {
    table.dropColumn('long_leave');
    table.dropColumn('maternity_leave');
    table.dropColumn('paternity_leave');
    table.dropColumn('marriage_leave');
    table.dropColumn('death_leave');
    table.dropColumn('hajj_umrah_leave');
  });

  // Drop the new enum type
  await knex.raw(`DROP TYPE leave_type;`);

  // Create the old enum type
  await knex.raw(`
    CREATE TYPE leave_type AS ENUM ('sick', 'vacation', 'personal', 'other');
  `);

  // Convert existing leave types back to old format
  await knex.raw(`
    UPDATE leave_requests 
    SET type = CASE 
      WHEN type IN ('annual', 'marriage', 'death', 'hajj_umrah') THEN 'vacation'
      WHEN type = 'sick' THEN 'sick'
      WHEN type IN ('long', 'maternity', 'paternity') THEN 'other'
      ELSE 'other'
    END;
  `);

  // Convert the column back to the old enum type
  await knex.raw(`
    ALTER TABLE leave_requests 
    ALTER COLUMN type TYPE leave_type 
    USING type::leave_type;
  `);
}; 