const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")

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
    const items = await db('payroll_items as pi')
        .join('users as u', 'pi.user_id', 'u.id')
        .where({ payroll_period_id: periodId })
        .select('pi.*', 'u.name as user_name');
    res.status(200).json({ success: true, count: items.length, data: items });
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
