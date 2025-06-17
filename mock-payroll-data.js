const { db } = require('./src/config/db');
const bcrypt = require('bcryptjs');

async function createMockPayrollData() {
  console.log('=== Creating Mock Payroll Data ===\n');

  try {
    // Step 1: Create 5 users with different roles
    console.log('1. Creating 5 users with different roles...');
    
    const users = [
      {
        id: 'USR001',
        name: 'John Manager',
        email: 'john.manager@company.com',
        role: 'manager',
        department: 'Operations',
        position: 'Operations Manager',
        base_salary: 8000000, // 8 million IDR
        meal_allowance: 300000 // 300k IDR per day
      },
      {
        id: 'USR002', 
        name: 'Sarah HR',
        email: 'sarah.hr@company.com',
        role: 'hr',
        department: 'Human Resources',
        position: 'HR Specialist',
        base_salary: 6000000, // 6 million IDR
        meal_allowance: 250000 // 250k IDR per day
      },
      {
        id: 'USR003',
        name: 'Mike Developer',
        email: 'mike.dev@company.com', 
        role: 'employee',
        department: 'IT',
        position: 'Senior Developer',
        base_salary: 7000000, // 7 million IDR
        meal_allowance: 275000 // 275k IDR per day
      },
      {
        id: 'USR004',
        name: 'Lisa Finance',
        email: 'lisa.finance@company.com',
        role: 'employee', 
        department: 'Finance',
        position: 'Financial Analyst',
        base_salary: 5500000, // 5.5 million IDR
        meal_allowance: 225000 // 225k IDR per day
      },
      {
        id: 'USR005',
        name: 'David Sales',
        email: 'david.sales@company.com',
        role: 'employee',
        department: 'Sales',
        position: 'Sales Representative', 
        base_salary: 5000000, // 5 million IDR
        meal_allowance: 200000 // 200k IDR per day
      }
    ];

    const hashedPassword = await bcrypt.hash('password123', 10);

    // Use a single transaction for all user creation to avoid connection issues
    await db.transaction(async (trx) => {
      // Create users
      for (const userData of users) {
        // Check if user already exists
        const existingUser = await trx('users').where('email', userData.email).first();
        if (existingUser) {
          console.log(`  - User ${userData.email} already exists, skipping...`);
          continue;
        }

        // Insert user
        await trx('users').insert({
          id: userData.id,
          name: userData.name,
          email: userData.email,
          password: hashedPassword,
          role: userData.role,
          department: userData.department,
          position: userData.position,
          active: true
        });

        // Create employee record
        await trx('employees').insert({
          employee_id: userData.id,
          full_name: userData.name,
          gender: 'other',
          place_of_birth: 'Jakarta',
          date_of_birth: new Date('1990-01-01'),
          address: 'Jakarta, Indonesia',
          phone_number: '081234567890',
          email: userData.email,
          marital_status: 'single',
          number_of_children: 0,
          position: userData.position,
          department: userData.department,
          hire_date: new Date('2023-01-01'),
          employment_status: 'permanent',
          basic_salary: userData.base_salary,
          allowance: userData.meal_allowance,
          user_id: userData.id
        });

        // Create compensation record
        const compensationId = `COMP-${userData.id}`;
        await trx('compensation').insert({
          id: compensationId,
          user_id: userData.id,
          base_salary: userData.base_salary,
          meal_allowance: userData.meal_allowance,
          effective_date: new Date('2024-01-01'),
          created_by: userData.id
        });

        console.log(`  ✓ Created user: ${userData.name} (${userData.role})`);
      }
    });

    // Step 2: Create attendance records for May 2024 with some absences
    console.log('\n2. Creating attendance records for May 2024...');
    
    const may2024Start = new Date('2024-05-01');
    const may2024End = new Date('2024-05-31');
    
    // Process attendance in batches to avoid overwhelming the connection pool
    for (const userData of users) {
      console.log(`  Creating attendance for ${userData.name}...`);
      
      // Collect all attendance records for this user first
      const attendanceRecords = [];
      const leaveRecords = [];
      
      // Generate attendance for each day in May 2024
      for (let date = new Date(may2024Start); date <= may2024End; date.setDate(date.getDate() + 1)) {
        const currentDate = new Date(date);
        const dayOfWeek = currentDate.getDay();
        
        // Skip weekends (Saturday = 6, Sunday = 0)
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          continue;
        }

        // Create some absence patterns (different for each user)
        let shouldBeAbsent = false;
        
        switch (userData.id) {
          case 'USR001': // John Manager - absent on 5 random days
            shouldBeAbsent = [3, 10, 17, 24, 31].includes(currentDate.getDate());
            break;
          case 'USR002': // Sarah HR - absent on 3 days
            shouldBeAbsent = [7, 14, 21].includes(currentDate.getDate());
            break;
          case 'USR003': // Mike Developer - absent on 4 days  
            shouldBeAbsent = [2, 9, 16, 23].includes(currentDate.getDate());
            break;
          case 'USR004': // Lisa Finance - absent on 6 days
            shouldBeAbsent = [1, 8, 15, 22, 29, 30].includes(currentDate.getDate());
            break;
          case 'USR005': // David Sales - absent on 2 days
            shouldBeAbsent = [13, 27].includes(currentDate.getDate());
            break;
        }

        if (!shouldBeAbsent) {
          // Prepare check-in record
          const checkInId = `ATT-IN-${userData.id}-${currentDate.getDate().toString().padStart(2, '0')}`;
          const checkInTime = new Date(currentDate);
          checkInTime.setHours(8, Math.floor(Math.random() * 60), 0, 0); // Random time between 8:00-8:59

          attendanceRecords.push({
            id: checkInId,
            user_id: userData.id,
            type: 'check-in',
            timestamp: checkInTime,
            status: 'valid'
          });

          // Prepare check-out record
          const checkOutId = `ATT-OUT-${userData.id}-${currentDate.getDate().toString().padStart(2, '0')}`;
          const checkOutTime = new Date(currentDate);
          checkOutTime.setHours(17, Math.floor(Math.random() * 60), 0, 0); // Random time between 17:00-17:59

          attendanceRecords.push({
            id: checkOutId,
            user_id: userData.id,
            type: 'check-out', 
            timestamp: checkOutTime,
            status: 'valid'
          });
        } else {
          // Prepare leave request for absent days
          const leaveId = `LV-${userData.id}-${currentDate.getDate().toString().padStart(2, '0')}`;
          leaveRecords.push({
            id: leaveId,
            user_id: userData.id,
            type: 'sick',
            start_date: currentDate,
            end_date: currentDate,
            reason: 'Sick leave',
            status: 'approved',
            approved_by: 'admin'
          });
        }
      }
      
      // Insert all records for this user in a single transaction
      await db.transaction(async (trx) => {
        // Insert attendance records in batches
        if (attendanceRecords.length > 0) {
          // Insert in chunks of 20 to avoid query size limits
          for (let i = 0; i < attendanceRecords.length; i += 20) {
            const chunk = attendanceRecords.slice(i, i + 20);
            await trx('attendance').insert(chunk);
          }
        }
        
        // Insert leave records
        if (leaveRecords.length > 0) {
          await trx('leave_requests').insert(leaveRecords);
        }
      });
      
      console.log(`    ✓ Created ${attendanceRecords.length} attendance records and ${leaveRecords.length} leave requests`);
    }

    console.log('✓ Attendance records created for May 2024');

    // Step 3: Calculate and display payroll summary
    console.log('\n3. Calculating payroll summary for May 2024...');
    
    const payrollSummary = [];
    
    for (const userData of users) {
      // Count attendance days in May 2024
      const attendanceDays = await db('attendance')
        .where('user_id', userData.id)
        .where('type', 'check-in')
        .whereBetween('timestamp', [may2024Start, may2024End])
        .count('* as count')
        .first();

      const daysWorked = parseInt(attendanceDays.count) || 0;
      const totalWorkingDaysInMay = 23; // May 2024 has 23 working days (excluding weekends)
      const absenceDays = totalWorkingDaysInMay - daysWorked;
      
      // Calculate meal allowance based on days worked
      const mealAllowanceTotal = daysWorked * userData.meal_allowance;
      
      // Calculate salary (base salary is monthly, no deduction for absences in this example)
      const baseSalaryTotal = userData.base_salary;
      const totalSalary = baseSalaryTotal + mealAllowanceTotal;

      const payrollData = {
        userId: userData.id,
        name: userData.name,
        department: userData.department,
        position: userData.position,
        baseSalary: baseSalaryTotal,
        mealAllowancePerDay: userData.meal_allowance,
        daysWorked: daysWorked,
        absenceDays: absenceDays,
        totalWorkingDays: totalWorkingDaysInMay,
        mealAllowanceTotal: mealAllowanceTotal,
        totalSalary: totalSalary
      };

      payrollSummary.push(payrollData);

      console.log(`  ${userData.name}:`);
      console.log(`    - Days Worked: ${daysWorked}/${totalWorkingDaysInMay}`);
      console.log(`    - Absence Days: ${absenceDays}`);
      console.log(`    - Base Salary: Rp ${baseSalaryTotal.toLocaleString('id-ID')}`);
      console.log(`    - Meal Allowance: Rp ${mealAllowanceTotal.toLocaleString('id-ID')} (${daysWorked} days × Rp ${userData.meal_allowance.toLocaleString('id-ID')})`);
      console.log(`    - Total Salary: Rp ${totalSalary.toLocaleString('id-ID')}`);
      console.log('');
    }

    console.log('\n=== Payroll Data Created Successfully ===');
    console.log('\nNext steps:');
    console.log('1. Run the payroll generation API to create Excel report');
    console.log('2. Run the payroll PDF generation for individual payslips');
    console.log('\nTest API endpoints:');
    console.log('- GET /api/payroll/attendance-payroll?period=2024-05&generate=excel');
    console.log('- GET /api/payroll/attendance-payroll?period=2024-05&generate=pdf');
    console.log('- GET /api/payroll/payslip/USR001?period=2024-05 (individual payslips)');

    return payrollSummary;

  } catch (error) {
    console.error('Error creating mock payroll data:', error);
    throw error;
  } finally {
    // Always destroy the connection pool when done
    console.log('\nClosing database connections...');
    await db.destroy();
  }
}

// Run the script if called directly
if (require.main === module) {
  createMockPayrollData()
    .then(() => {
      console.log('Mock payroll data creation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to create mock payroll data:', error);
      process.exit(1);
    });
}

module.exports = { createMockPayrollData }; 