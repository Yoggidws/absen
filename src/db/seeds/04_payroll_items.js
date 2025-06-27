/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // First clear the table
  await knex('payroll_items').del();

  // Get all payroll periods
  const periods = await knex('payroll_periods').orderBy(['year', 'month']);
  
  // Get all active users
  const users = await knex('users as u')
    .join('employees as e', 'u.id', 'e.user_id')
    .leftJoin('compensation as c', 'u.id', 'c.user_id')
    .where('u.active', true)
    .select(
      'u.id as user_id',
      'u.name',
      'u.email',
      'u.department',
      'u.position',
      'e.basic_salary',
      'e.allowance',
      'c.base_salary as comp_base_salary',
      'c.meal_allowance as comp_meal_allowance'
    );

  // Helper function to generate IDs
  const generateId = (prefix) => `${prefix}${Date.now()}${Math.random().toString(36).substring(2, 6)}`.toUpperCase();

  // Helper function to calculate working days in a period
  const getWorkingDaysInPeriod = (startDate, endDate) => {
    let workingDays = 0;
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      // 0 is Sunday, 6 is Saturday
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return workingDays;
  };

  // Create payroll items for each period and user
  const payrollItems = [];

  for (const period of periods) {
    const startDate = new Date(period.start_date);
    const endDate = new Date(period.end_date);
    const totalWorkingDays = getWorkingDaysInPeriod(startDate, endDate);

    for (const user of users) {
      // Get attendance data for this period
      const attendanceResult = await knex('attendance')
        .where('user_id', user.user_id)
        .where('type', 'check-in')
        .whereBetween('timestamp', [startDate, endDate])
        .count('* as count')
        .first();

      const daysWorked = parseInt(attendanceResult.count) || 0;
      const absenceDays = totalWorkingDays - daysWorked;

      // Use compensation data if available, otherwise use employee data
      const baseSalary = user.comp_base_salary || user.basic_salary || 0;
      const mealAllowancePerDay = user.comp_meal_allowance || user.allowance || 0;

      // Calculate meal allowance based on actual attendance
      const mealAllowanceTotal = daysWorked * mealAllowancePerDay;

      // Calculate gross salary (base salary + meal allowance)
      const grossSalary = baseSalary + mealAllowanceTotal;

      // Calculate deductions (example: 5% tax, 2% insurance)
      const taxDeduction = grossSalary * 0.05;
      const insuranceDeduction = grossSalary * 0.02;
      const totalDeductions = taxDeduction + insuranceDeduction;

      // Calculate net salary
      const netSalary = grossSalary - totalDeductions;

      payrollItems.push({
        id: generateId('PAYITEM-'),
        payroll_period_id: period.id,
        user_id: user.user_id,
        base_salary: baseSalary,
        bonuses: mealAllowanceTotal, // Using meal allowance as bonus
        deductions: totalDeductions,
        absence_deduction: 0, // Not calculating absence deductions for now
        gross_salary: grossSalary,
        net_salary: netSalary,
        working_days: totalWorkingDays,
        present_days: daysWorked,
        absent_days: absenceDays,
        paid_leave_days: 0, // Would need to check leave records
        unpaid_leave_days: 0, // Would need to check leave records
        status: period.status === 'paid' ? 'paid' : 'pending',
        currency: 'USD',
        payment_date: period.status === 'paid' ? period.end_date : null,
        payment_method: period.status === 'paid' ? 'bank_transfer' : null,
        payment_reference: period.status === 'paid' ? generateId('PAY-REF-') : null,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  // Insert payroll items in batches to avoid memory issues
  const batchSize = 100;
  for (let i = 0; i < payrollItems.length; i += batchSize) {
    const batch = payrollItems.slice(i, i + batchSize);
    await knex('payroll_items').insert(batch);
  }

  console.log(`✓ Created ${payrollItems.length} payroll items`);
}; 