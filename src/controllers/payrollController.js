const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const ExcelJS = require('exceljs')
const PDFDocument = require('pdfkit')
const path = require('path')
const fs = require('fs')

// Helper to generate IDs, assuming a utility for this exists.
const generateId = (prefix) => `${prefix}${Date.now()}${Math.random().toString(36).substring(2, 6)}`.toUpperCase();

/**
 * @desc    Create a new payroll period
 * @route   POST /api/payroll/periods
 * @access  Private (manage:payroll)
 */
exports.createPayrollPeriod = asyncHandler(async (req, res) => {
    const { name, start_date, end_date, month, year } = req.body;
    if (!name || !start_date || !end_date || !month || !year) {
        res.status(400);
        throw new Error("Missing required fields for payroll period.");
    }
    const id = generateId('PAY-');
    const [period] = await db('payroll_periods').insert({
        id, name, start_date, end_date, month, year, status: 'draft', created_by: req.user.id
    }).returning('*');
    res.status(201).json({ success: true, data: period });
});

/**
 * @desc    Get all payroll periods
 * @route   GET /api/payroll/periods
 * @access  Private (read:payroll:all)
 */
exports.getAllPayrollPeriods = asyncHandler(async (req, res) => {
    const periods = await db('payroll_periods').orderBy('start_date', 'desc');
    res.status(200).json({ success: true, count: periods.length, data: periods });
});

/**
 * @desc    Get a single payroll period by ID
 * @route   GET /api/payroll/periods/:id
 * @access  Private (read:payroll:all)
 */
exports.getPayrollPeriodById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const period = await db('payroll_periods').where({ id }).first();
    if (!period) {
        res.status(404);
        throw new Error('Payroll period not found');
    }
    res.status(200).json({ success: true, data: period });
});

/**
 * @desc    Update a payroll period
 * @route   PUT /api/payroll/periods/:id
 * @access  Private (manage:payroll)
 */
exports.updatePayrollPeriod = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, start_date, end_date, status } = req.body;
    const [period] = await db('payroll_periods').where({ id }).update({
        name, start_date, end_date, status, updated_at: db.fn.now()
    }).returning('*');
    if (!period) {
        res.status(404);
        throw new Error('Payroll period not found');
    }
    res.status(200).json({ success: true, data: period });
});

/**
 * @desc    Delete a payroll period
 * @route   DELETE /api/payroll/periods/:id
 * @access  Private (manage:payroll)
 */
exports.deletePayrollPeriod = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const deleted = await db('payroll_periods').where({ id }).del();
    if (!deleted) {
        res.status(404);
        throw new Error('Payroll period not found');
    }
    res.status(200).json({ success: true, message: 'Payroll period deleted' });
});

/**
 * @desc    Run payroll for a period
 * @route   POST /api/payroll/run/:periodId
 * @access  Private (manage:payroll)
 */
exports.runPayroll = asyncHandler(async (req, res) => {
    const { periodId } = req.params;
    // In a real application, this would trigger a complex background job.
    // For now, we'll just update the status to show it's processing.
    await db('payroll_periods').where({ id: periodId }).update({ status: 'processing' });
    res.status(200).json({ success: true, message: `Payroll run initiated for period ${periodId}.` });
});

/**
 * @desc    Get all payroll items for a period
 * @route   GET /api/payroll/items/:periodId
 * @access  Private (read:payroll:all)
 */
exports.getPayrollItems = asyncHandler(async (req, res) => {
    const { periodId } = req.params;

    // Get the payroll period
    const period = await db('payroll_periods').where({ id: periodId }).first();
    if (!period) {
        res.status(404);
        throw new Error('Payroll period not found');
    }

    // Get the payroll items with user details
    const items = await db('payroll_items as pi')
        .join('users as u', 'pi.user_id', 'u.id')
        .where({ payroll_period_id: periodId })
        .select(
            'pi.*',
            'u.name as employee_name',
            'u.id as employee_id',
            'u.email',
            'u.department',
            'u.position'
        );

    // Calculate totals
    const totals = items.reduce((acc, item) => ({
        total_employees: acc.total_employees + 1,
        total_base_salary: acc.total_base_salary + parseFloat(item.base_salary),
        total_bonuses: acc.total_bonuses + parseFloat(item.bonuses),
        total_deductions: acc.total_deductions + parseFloat(item.deductions),
        total_absence_deduction: acc.total_absence_deduction + parseFloat(item.absence_deduction),
        total_gross_salary: acc.total_gross_salary + parseFloat(item.gross_salary),
        total_net_salary: acc.total_net_salary + parseFloat(item.net_salary),
        total_working_days: acc.total_working_days + parseInt(item.working_days),
        total_present_days: acc.total_present_days + parseInt(item.present_days),
        total_absent_days: acc.total_absent_days + parseInt(item.absent_days)
    }), {
        total_employees: 0,
        total_base_salary: 0,
        total_bonuses: 0,
        total_deductions: 0,
        total_absence_deduction: 0,
        total_gross_salary: 0,
        total_net_salary: 0,
        total_working_days: 0,
        total_present_days: 0,
        total_absent_days: 0
    });

    res.status(200).json({
        success: true,
        data: {
            payroll_period: period,
            items,
            totals
        }
    });
});

/**
 * @desc    Get a single payroll item by ID
 * @route   GET /api/payroll/item/:id
 * @access  Private (read:payroll:all)
 */
exports.getPayrollItemById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await db('payroll_items').where({ id }).first();
    if (!item) {
        res.status(404);
        throw new Error('Payroll item not found');
    }
    res.status(200).json({ success: true, data: item });
});

/**
 * @desc    Update a payroll item
 * @route   PUT /api/payroll/item/:id
 * @access  Private (manage:payroll)
 */
exports.updatePayrollItem = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [item] = await db('payroll_items').where({ id }).update(req.body).returning('*');
    if (!item) {
        res.status(404);
        throw new Error('Payroll item not found');
    }
    res.status(200).json({ success: true, data: item });
});

/**
 * @desc    Get payroll history for the current employee
 * @route   GET /api/payroll/my-payroll
 * @access  Private (read:payroll:own)
 */
exports.getEmployeePayroll = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const payrolls = await db('payroll_items as pi')
        .join('payroll_periods as pp', 'pi.payroll_period_id', 'pp.id')
        .where({ user_id: userId })
        .select('pi.*', 'pp.name as period_name')
        .orderBy('pp.start_date', 'desc');

    res.status(200).json({ success: true, count: payrolls.length, data: payrolls });
});

/**
 * @desc    Get payroll statistics
 * @route   GET /api/payroll/stats
 * @access  Private (read:payroll:all)
 */
exports.getPayrollStats = asyncHandler(async (req, res) => {
    const totalNet = await db('payroll_items').sum('net_salary as total_net_salary').first();
    const totalGross = await db('payroll_items').sum('gross_salary as total_gross_salary').first();
    const periodsCount = await db('payroll_periods').count('id as count').first();

    res.status(200).json({
        success: true,
        data: {
            total_net_salary: parseFloat(totalNet.total_net_salary) || 0,
            total_gross_salary: parseFloat(totalGross.total_gross_salary) || 0,
            payroll_periods: parseInt(periodsCount.count)
        }
    });
});

/**
 * @desc    Get all payslips for the current user
 * @route   GET /api/payroll/my-payslips
 * @access  Private (read:payroll:own)
 */
exports.getMyPayslips = asyncHandler(async (req, res) => {
    const payslips = await db('payroll_items')
        .where({ user_id: req.user.id })
        .join('payroll_periods', 'payroll_items.payroll_period_id', 'payroll_periods.id')
        .select(
            'payroll_items.id',
            'payroll_periods.name as period_name',
            'payroll_periods.end_date',
            'payroll_items.net_salary',
            'payroll_items.currency'
        )
        .orderBy('payroll_periods.end_date', 'desc');

    res.status(200).json({ success: true, count: payslips.length, data: payslips });
});

/**
 * @desc    Get a single payslip by ID
 * @route   GET /api/payroll/payslips/:id
 * @access  Private (read:payroll:own)
 */
exports.getPayslipById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payslip = await db('payroll_items as pi')
        .where({ 'pi.id': id, 'pi.user_id': req.user.id })
        .join('payroll_periods as pp', 'pi.payroll_period_id', 'pp.id')
        .join('users as u', 'pi.user_id', 'u.id')
        .select(
            'pi.*',
            'pp.name as period_name',
            'u.name as user_name',
            'u.department',
            'u.position'
        )
        .first();

    if (!payslip) {
        res.status(404);
        throw new Error('Payslip not found or you do not have permission to view it.');
    }

    res.status(200).json({ success: true, data: payslip });
});

/**
 * @desc    Generate and download a payslip as PDF
 * @route   GET /api/payroll/payslips/:id/pdf
 * @access  Private (read:payroll:own)
 */
exports.generatePayslipPDF = asyncHandler(async (req, res) => {
    // This is a simplified PDF generation. A real one would be much more detailed.
    const { id } = req.params;
    const PDFDocument = require('pdfkit');

    const payslip = await db('payroll_items as pi')
        .where({ 'pi.id': id })
        .join('users as u', 'pi.user_id', 'u.id')
        .join('payroll_periods as pp', 'pi.payroll_period_id', 'pp.id')
        .select('pi.*', 'u.name as user_name', 'u.department', 'u.position', 'pp.name as period_name')
        .first();

    if (!payslip) {
        res.status(404);
        throw new Error('Payslip not found.');
    }

    // Security check: ensure the user is the owner of the payslip or has admin rights
    if (payslip.user_id !== req.user.id && !req.user.permissions.includes('read:payroll:all')) {
        res.status(403);
        throw new Error('Forbidden: You do not have permission to view this payslip.');
    }

    const doc = new PDFDocument({ margin: 50 });
    const filename = `payslip-${payslip.period_name.replace(/\s/g, '_')}-${payslip.user_name.replace(/\s/g, '_')}.pdf`;

    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Payslip', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Period: ${payslip.period_name}`);
    doc.text(`Employee: ${payslip.user_name}`);
    doc.text(`Department: ${payslip.department}`);
    doc.text(`Position: ${payslip.position}`);
    doc.moveDown();

    doc.text(`Gross Salary: ${payslip.gross_salary}`);
    doc.text(`Deductions: ${payslip.deductions}`);
    doc.text(`Absence Deduction: ${payslip.absence_deduction}`);
    doc.text(`Net Salary: ${payslip.net_salary}`);

    doc.end();
});

// Stubbed legacy functions to prevent crashes from old route definitions
exports.generatePayroll = asyncHandler(async(req, res) => {
    res.status(501).json({success: false, message: "This route is deprecated. Use /run/:periodId instead."})
})

exports.getPayrollPeriods = asyncHandler(async(req, res) => {
    return exports.getAllPayrollPeriods(req, res);
})

exports.updatePayrollPeriodStatus = asyncHandler(async(req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    return exports.updatePayrollPeriod(req, res);
})

exports.sendPayslipsByEmail = asyncHandler(async(req, res) => {
    res.status(501).json({success: false, message: "Emailing payslips is not implemented yet."})
})

/**
 * @desc    Generate payroll with meal allowance adjustments
 * @route   POST /api/payroll/calculate-with-allowance
 * @access  Private/Admin
 */
exports.calculatePayrollWithAllowance = asyncHandler(async (req, res) => {
  const { period, generate } = req.query

  if (!period) {
    res.status(400)
    throw new Error("Period is required (format: YYYY-MM)")
  }

  // Parse period
  const [year, month] = period.split('-')
  const startDate = new Date(parseInt(year), parseInt(month) - 1, 1)
  const endDate = new Date(parseInt(year), parseInt(month), 0)

  // Calculate total working days
  const totalWorkingDays = getWorkingDaysInPeriod(startDate, endDate)

  // Get all active employees with their compensation data
  const users = await db('users as u')
    .join('employees as e', 'u.id', 'e.user_id')
    .leftJoin('compensation as c', 'u.id', 'c.user_id')
    .where('u.active', true)
    .select(
      'u.id as user_id',
      'u.name',
      'u.email',
      'u.department',
      'u.position',
      'u.role',
      'e.basic_salary',
      'e.allowance',
      'c.base_salary as comp_base_salary',
      'c.meal_allowance as comp_meal_allowance'
    )

  const payrollData = []

  for (const user of users) {
    // Count actual attendance days
    const attendanceResult = await db('attendance')
      .where('user_id', user.user_id)
      .where('type', 'check-in')
      .whereBetween('timestamp', [startDate, endDate])
      .count('* as count')
      .first()
    
    const daysWorked = parseInt(attendanceResult.count) || 0
    const absenceDays = totalWorkingDays - daysWorked
    
    // Use compensation data if available, otherwise use employee data
    const baseSalary = user.comp_base_salary || user.basic_salary || 0
    const mealAllowancePerDay = user.comp_meal_allowance || user.allowance || 0
    
    // Calculate meal allowance based on actual attendance
    // Only get meal allowance for days actually worked
    const mealAllowanceTotal = daysWorked * mealAllowancePerDay
    
    // Calculate gross salary (base salary + meal allowance)
    const grossSalary = baseSalary + mealAllowanceTotal
    
    // Calculate deductions (example: 5% tax, 2% insurance)
    const taxDeduction = grossSalary * 0.05
    const insuranceDeduction = grossSalary * 0.02
    const totalDeductions = taxDeduction + insuranceDeduction
    
    // Calculate net salary
    const netSalary = grossSalary - totalDeductions

    const payrollItem = {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      department: user.department,
      position: user.position,
      role: user.role,
      base_salary: baseSalary,
      meal_allowance_per_day: mealAllowancePerDay,
      total_working_days: totalWorkingDays,
      days_worked: daysWorked,
      absence_days: absenceDays,
      meal_allowance_total: mealAllowanceTotal,
      gross_salary: grossSalary,
      tax_deduction: taxDeduction,
      insurance_deduction: insuranceDeduction,
      total_deductions: totalDeductions,
      net_salary: netSalary,
      currency: 'IDR',
      period: period
    }
    
    payrollData.push(payrollItem)
  }

  // Generate Excel if requested
  if (generate === 'excel') {
    return await generatePayrollExcel(payrollData, period, res)
  }
  
  // Generate PDF if requested  
  if (generate === 'pdf') {
    return await generatePayrollPDF(payrollData, period, res)
  }

  // Return JSON data
  res.status(200).json({
    success: true,
    period: period,
    total_working_days: totalWorkingDays,
    count: payrollData.length,
    data: payrollData
  })
})

/**
 * @desc    Generate attendance-based payroll with meal allowances
 * @route   GET /api/payroll/attendance-payroll
 * @access  Private (read:payroll:all)
 */
exports.generateAttendanceBasedPayroll = asyncHandler(async (req, res) => {
  const { period, generate } = req.query
  
  if (!period) {
    res.status(400)
    throw new Error("Period is required (format: YYYY-MM)")
  }

  const [year, month] = period.split('-')
  const startDate = new Date(parseInt(year), parseInt(month) - 1, 1)
  const endDate = new Date(parseInt(year), parseInt(month), 0)
  
  console.log(`Generating payroll for ${period} (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`)

  // Get all active users with their compensation data
  const users = await db('users as u')
    .join('employees as e', 'u.id', 'e.user_id')
    .leftJoin('compensation as c', 'u.id', 'c.user_id')
    .where('u.active', true)
    .select(
      'u.id as user_id',
      'u.name',
      'u.email', 
      'u.department',
      'u.position',
      'u.role',
      'e.basic_salary',
      'e.allowance',
      'c.base_salary as comp_base_salary',
      'c.meal_allowance as comp_meal_allowance'
    )

  if (users.length === 0) {
    res.status(404)
    throw new Error("No active users found")
  }

  const payrollData = []
  
  // Calculate working days in the period (excluding weekends)
  const totalWorkingDays = getWorkingDaysInPeriod(startDate, endDate)
  
  for (const user of users) {
    // Count actual attendance days
    const attendanceResult = await db('attendance')
      .where('user_id', user.user_id)
      .where('type', 'check-in')
      .whereBetween('timestamp', [startDate, endDate])
      .count('* as count')
      .first()
    
    const daysWorked = parseInt(attendanceResult.count) || 0
    const absenceDays = totalWorkingDays - daysWorked
    
    // Use compensation data if available, otherwise use employee data
    const baseSalary = user.comp_base_salary || user.basic_salary || 0
    const mealAllowancePerDay = user.comp_meal_allowance || user.allowance || 0
    
    // Calculate meal allowance based on actual attendance
    const mealAllowanceTotal = daysWorked * mealAllowancePerDay
    
    // Calculate deductions (example: 5% tax, 2% insurance)
    const grossSalary = baseSalary + mealAllowanceTotal
    const taxDeduction = grossSalary * 0.05
    const insuranceDeduction = grossSalary * 0.02
    const totalDeductions = taxDeduction + insuranceDeduction
    const netSalary = grossSalary - totalDeductions
    
    const payrollItem = {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      department: user.department,
      position: user.position,
      role: user.role,
      base_salary: baseSalary,
      meal_allowance_per_day: mealAllowancePerDay,
      total_working_days: totalWorkingDays,
      days_worked: daysWorked,
      absence_days: absenceDays,
      meal_allowance_total: mealAllowanceTotal,
      gross_salary: grossSalary,
      tax_deduction: taxDeduction,
      insurance_deduction: insuranceDeduction,
      total_deductions: totalDeductions,
      net_salary: netSalary,
      currency: 'IDR',
      period: period
    }
    
    payrollData.push(payrollItem)
  }

  // Generate Excel if requested
  if (generate === 'excel') {
    return await generatePayrollExcel(payrollData, period, res)
  }
  
  // Generate PDF if requested  
  if (generate === 'pdf') {
    return await generatePayrollPDF(payrollData, period, res)
  }

  // Return JSON data
  res.status(200).json({
    success: true,
    period: period,
    total_working_days: totalWorkingDays,
    count: payrollData.length,
    data: payrollData
  })
})

/**
 * @desc    Generate individual payslip PDF
 * @route   GET /api/payroll/payslip/:userId
 * @access  Private
 */
exports.generateIndividualPayslip = asyncHandler(async (req, res) => {
  const { userId } = req.params
  const { period } = req.query
  
  if (!period) {
    res.status(400)
    throw new Error("Period is required (format: YYYY-MM)")
  }

  // Check if user can access this payslip
  if (req.user.id !== userId && !req.hasPermission('read:payroll:all')) {
    res.status(403)
    throw new Error("Forbidden: You can only view your own payslip")
  }

  const [year, month] = period.split('-')
  const startDate = new Date(parseInt(year), parseInt(month) - 1, 1)
  const endDate = new Date(parseInt(year), parseInt(month), 0)

  // Get user data
  const user = await db('users as u')
    .join('employees as e', 'u.id', 'e.user_id')
    .leftJoin('compensation as c', 'u.id', 'c.user_id')
    .where('u.id', userId)
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
    )
    .first()

  if (!user) {
    res.status(404)
    throw new Error("User not found")
  }

  // Calculate payroll data for this user
  const attendanceResult = await db('attendance')
    .where('user_id', userId)
    .where('type', 'check-in')
    .whereBetween('timestamp', [startDate, endDate])
    .count('* as count')
    .first()
  
  const daysWorked = parseInt(attendanceResult.count) || 0
  const totalWorkingDays = getWorkingDaysInPeriod(startDate, endDate)
  const absenceDays = totalWorkingDays - daysWorked
  
  const baseSalary = user.comp_base_salary || user.basic_salary || 0
  const mealAllowancePerDay = user.comp_meal_allowance || user.allowance || 0
  const mealAllowanceTotal = daysWorked * mealAllowancePerDay
  const grossSalary = baseSalary + mealAllowanceTotal
  const taxDeduction = grossSalary * 0.05
  const insuranceDeduction = grossSalary * 0.02
  const totalDeductions = taxDeduction + insuranceDeduction
  const netSalary = grossSalary - totalDeductions

  return await generateIndividualPayslipPDF(user, {
    period,
    base_salary: baseSalary,
    meal_allowance_per_day: mealAllowancePerDay,
    total_working_days: totalWorkingDays,
    days_worked: daysWorked,
    absence_days: absenceDays,
    meal_allowance_total: mealAllowanceTotal,
    gross_salary: grossSalary,
    tax_deduction: taxDeduction,
    insurance_deduction: insuranceDeduction,
    total_deductions: totalDeductions,
    net_salary: netSalary
  }, res)
})

// Helper function to calculate working days
function getWorkingDaysInPeriod(startDate, endDate) {
  let workingDays = 0
  const currentDate = new Date(startDate)
  
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay()
    // 0 is Sunday, 6 is Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }
  
  return workingDays
}

// Helper function to generate Excel report
async function generatePayrollExcel(payrollData, period, res) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Payroll Report')
  
  // Set up headers
  worksheet.columns = [
    { header: 'Employee ID', key: 'user_id', width: 15 },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Position', key: 'position', width: 20 },
    { header: 'Base Salary', key: 'base_salary', width: 15 },
    { header: 'Meal Allowance/Day', key: 'meal_allowance_per_day', width: 18 },
    { header: 'Working Days', key: 'total_working_days', width: 15 },
    { header: 'Days Worked', key: 'days_worked', width: 15 },
    { header: 'Absence Days', key: 'absence_days', width: 15 },
    { header: 'Total Meal Allowance', key: 'meal_allowance_total', width: 20 },
    { header: 'Gross Salary', key: 'gross_salary', width: 15 },
    { header: 'Tax Deduction', key: 'tax_deduction', width: 15 },
    { header: 'Insurance Deduction', key: 'insurance_deduction', width: 18 },
    { header: 'Total Deductions', key: 'total_deductions', width: 18 },
    { header: 'Net Salary', key: 'net_salary', width: 15 }
  ]

  // Add title row
  worksheet.mergeCells('A1:O1')
  const titleCell = worksheet.getCell('A1')
  titleCell.value = `Payroll Report - ${period}`
  titleCell.font = { size: 16, bold: true }
  titleCell.alignment = { horizontal: 'center' }
  
  // Add header row (row 3, since row 1 is title and row 2 is empty)
  worksheet.insertRow(3, [])
  
  // Style headers
  const headerRow = worksheet.getRow(3)
  headerRow.values = [
    'Employee ID', 'Name', 'Department', 'Position', 'Base Salary',
    'Meal Allowance/Day', 'Working Days', 'Days Worked', 'Absence Days',
    'Total Meal Allowance', 'Gross Salary', 'Tax Deduction', 
    'Insurance Deduction', 'Total Deductions', 'Net Salary'
  ]
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD3D3D3' }
  }

  // Add data rows
  payrollData.forEach((item, index) => {
    const row = worksheet.addRow({
      user_id: item.user_id,
      name: item.name,
      department: item.department,
      position: item.position,
      base_salary: item.base_salary,
      meal_allowance_per_day: item.meal_allowance_per_day,
      total_working_days: item.total_working_days,
      days_worked: item.days_worked,
      absence_days: item.absence_days,
      meal_allowance_total: item.meal_allowance_total,
      gross_salary: item.gross_salary,
      tax_deduction: item.tax_deduction,
      insurance_deduction: item.insurance_deduction,
      total_deductions: item.total_deductions,
      net_salary: item.net_salary
    })
    
    // Format currency columns
    const currencyColumns = ['E', 'F', 'J', 'K', 'L', 'M', 'N', 'O']
    currencyColumns.forEach(col => {
      const cell = row.getCell(col)
      cell.numFmt = '"Rp" #,##0'
    })
  })

  // Add totals row
  const totalsRow = worksheet.addRow({
    user_id: '',
    name: 'TOTAL',
    department: '',
    position: '',
    base_salary: payrollData.reduce((sum, item) => sum + item.base_salary, 0),
    meal_allowance_per_day: '',
    total_working_days: '',
    days_worked: payrollData.reduce((sum, item) => sum + item.days_worked, 0),
    absence_days: payrollData.reduce((sum, item) => sum + item.absence_days, 0),
    meal_allowance_total: payrollData.reduce((sum, item) => sum + item.meal_allowance_total, 0),
    gross_salary: payrollData.reduce((sum, item) => sum + item.gross_salary, 0),
    tax_deduction: payrollData.reduce((sum, item) => sum + item.tax_deduction, 0),
    insurance_deduction: payrollData.reduce((sum, item) => sum + item.insurance_deduction, 0),
    total_deductions: payrollData.reduce((sum, item) => sum + item.total_deductions, 0),
    net_salary: payrollData.reduce((sum, item) => sum + item.net_salary, 0)
  })
  
  totalsRow.font = { bold: true }
  totalsRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFCC00' }
  }

  const filename = `payroll-report-${period}-${Date.now()}.xlsx`
  const filepath = path.join(__dirname, '../../uploads/reports', filename)
  
  // Ensure directory exists
  const dir = path.dirname(filepath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  await workbook.xlsx.writeFile(filepath)
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  
  const fileStream = fs.createReadStream(filepath)
  fileStream.pipe(res)
  
  // Clean up file after sending
  fileStream.on('end', () => {
    fs.unlink(filepath, (err) => {
      if (err) console.error('Error deleting temporary file:', err)
    })
  })
}

// Helper function to generate overall payroll PDF
async function generatePayrollPDF(payrollData, period, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' })
  const filename = `payroll-summary-${period}-${Date.now()}.pdf`
  const filepath = path.join(__dirname, '../../uploads/reports', filename)
  
  // Ensure directory exists
  const dir = path.dirname(filepath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const stream = fs.createWriteStream(filepath)
  doc.pipe(stream)
  
  // Title
  doc.fontSize(20).text('Payroll Summary Report', { align: 'center' })
  doc.fontSize(14).text(`Period: ${period}`, { align: 'center' })
  doc.moveDown(2)
  
  // Summary table
  const totalGross = payrollData.reduce((sum, item) => sum + item.gross_salary, 0)
  const totalNet = payrollData.reduce((sum, item) => sum + item.net_salary, 0)
  const totalDeductions = payrollData.reduce((sum, item) => sum + item.total_deductions, 0)
  
  doc.fontSize(12)
  doc.text(`Total Employees: ${payrollData.length}`)
  doc.text(`Total Gross Salary: Rp ${totalGross.toLocaleString('id-ID')}`)
  doc.text(`Total Deductions: Rp ${totalDeductions.toLocaleString('id-ID')}`)
  doc.text(`Total Net Salary: Rp ${totalNet.toLocaleString('id-ID')}`)
  doc.moveDown(2)
  
  // Employee details
  doc.text('Employee Details:', { underline: true })
  doc.moveDown()
  
  payrollData.forEach((employee, index) => {
    if (doc.y > 700) { // Check if we need a new page
      doc.addPage()
    }
    
    doc.text(`${index + 1}. ${employee.name} (${employee.department})`)
    doc.text(`   Position: ${employee.position}`)
    doc.text(`   Days Worked: ${employee.days_worked}/${employee.total_working_days}`)
    doc.text(`   Base Salary: Rp ${employee.base_salary.toLocaleString('id-ID')}`)
    doc.text(`   Meal Allowance: Rp ${employee.meal_allowance_total.toLocaleString('id-ID')}`)
    doc.text(`   Net Salary: Rp ${employee.net_salary.toLocaleString('id-ID')}`)
    doc.moveDown()
  })
  
  doc.end()
  
  stream.on('finish', () => {
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    
    const fileStream = fs.createReadStream(filepath)
    fileStream.pipe(res)
    
    // Clean up file after sending
    fileStream.on('end', () => {
      fs.unlink(filepath, (err) => {
        if (err) console.error('Error deleting temporary file:', err)
      })
    })
  })
}

// Helper function to generate individual payslip PDF
async function generateIndividualPayslipPDF(user, payrollData, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' })
  const filename = `payslip-${user.name.replace(/\s+/g, '-')}-${payrollData.period}-${Date.now()}.pdf`
  const filepath = path.join(__dirname, '../../uploads/reports', filename)
  
  // Ensure directory exists
  const dir = path.dirname(filepath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const stream = fs.createWriteStream(filepath)
  doc.pipe(stream)
  
  // Header
  doc.fontSize(20).text('PAYSLIP', { align: 'center' })
  doc.moveDown()
  
  // Employee Info
  doc.fontSize(12)
  doc.text(`Employee: ${user.name}`)
  doc.text(`Employee ID: ${user.user_id}`)
  doc.text(`Department: ${user.department}`)
  doc.text(`Position: ${user.position}`)
  doc.text(`Pay Period: ${payrollData.period}`)
  doc.moveDown()
  
  // Earnings section
  doc.text('EARNINGS:', { underline: true })
  doc.text(`Base Salary: Rp ${payrollData.base_salary.toLocaleString('id-ID')}`)
  doc.text(`Meal Allowance (${payrollData.days_worked} days × Rp ${payrollData.meal_allowance_per_day.toLocaleString('id-ID')}): Rp ${payrollData.meal_allowance_total.toLocaleString('id-ID')}`)
  doc.text(`Gross Salary: Rp ${payrollData.gross_salary.toLocaleString('id-ID')}`, { underline: true })
  doc.moveDown()
  
  // Deductions section
  doc.text('DEDUCTIONS:', { underline: true })
  doc.text(`Tax (5%): Rp ${payrollData.tax_deduction.toLocaleString('id-ID')}`)
  doc.text(`Insurance (2%): Rp ${payrollData.insurance_deduction.toLocaleString('id-ID')}`)
  doc.text(`Total Deductions: Rp ${payrollData.total_deductions.toLocaleString('id-ID')}`, { underline: true })
  doc.moveDown()
  
  // Net salary
  doc.fontSize(14).text(`NET SALARY: Rp ${payrollData.net_salary.toLocaleString('id-ID')}`, { 
    align: 'center',
    underline: true,
    font: 'Helvetica-Bold'
  })
  doc.moveDown(2)
  
  // Attendance summary
  doc.fontSize(12).text('ATTENDANCE SUMMARY:', { underline: true })
  doc.text(`Total Working Days: ${payrollData.total_working_days}`)
  doc.text(`Days Worked: ${payrollData.days_worked}`)
  doc.text(`Absence Days: ${payrollData.absence_days}`)
  doc.text(`Attendance Rate: ${((payrollData.days_worked / payrollData.total_working_days) * 100).toFixed(1)}%`)
  
  doc.end()
  
  stream.on('finish', () => {
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    
    const fileStream = fs.createReadStream(filepath)
    fileStream.pipe(res)
    
    // Clean up file after sending
    fileStream.on('end', () => {
      fs.unlink(filepath, (err) => {
        if (err) console.error('Error deleting temporary file:', err)
      })
    })
  })
}
