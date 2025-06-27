/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // First clear the table
  await knex('payroll_periods').del();

  // Get current date for reference
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();

  // Helper function to generate IDs
  const generateId = (prefix) => `${prefix}${Date.now()}${Math.random().toString(36).substring(2, 6)}`.toUpperCase();

  // Create periods for the current year
  const periods = [];
  for (let month = 0; month < 12; month++) {
    const startDate = new Date(currentYear, month, 1);
    const endDate = new Date(currentYear, month + 1, 0); // Last day of the month

    periods.push({
      id: generateId('PAY-'),
      month: month + 1, // 1-12
      year: currentYear,
      name: `${startDate.toLocaleString('default', { month: 'long' })} ${currentYear}`,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      status: month < currentDate.getMonth() ? 'paid' : month === currentDate.getMonth() ? 'pending' : 'draft',
      created_by: '25050001' // Default admin user ID
    });
  }

  // Insert the periods
  await knex('payroll_periods').insert(periods);
}; 