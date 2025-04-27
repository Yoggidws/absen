const { db } = require("../config/db")

const Report = {
  /**
   * Find report by ID
   * @param {string} id - Report ID
   * @returns {Promise<Object>} - Report object
   */
  findById: async (id) => {
    return await db("reports as r")
      .leftJoin("users as u", "r.created_by", "u.id")
      .select(
        "r.id",
        "r.name",
        "r.type",
        "r.format",
        "r.date_range",
        "r.filters",
        "r.file_url",
        "r.is_scheduled",
        "r.schedule",
        "r.created_at",
        "r.updated_at",
        "u.name as created_by_name",
        "u.email as created_by_email",
      )
      .where("r.id", id)
      .first()
  },

  /**
   * Get all reports with optional filtering
   * @param {Object} filter - Filter criteria
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Array>} - Array of report objects
   */
  findAll: async (filter = {}, page = 1, limit = 10) => {
    const query = db("reports as r")
      .leftJoin("users as u", "r.created_by", "u.id")
      .select(
        "r.id",
        "r.name",
        "r.type",
        "r.format",
        "r.date_range",
        "r.file_url",
        "r.is_scheduled",
        "r.created_at",
        "r.updated_at",
        "u.name as created_by_name",
      )

    // Apply filters if provided
    if (filter.type) {
      query.where("r.type", filter.type)
    }

    if (filter.format) {
      query.where("r.format", filter.format)
    }

    if (filter.startDate) {
      query.whereRaw("(r.date_range->>'startDate')::timestamp >= ?", [filter.startDate])
    }

    if (filter.endDate) {
      query.whereRaw("(r.date_range->>'endDate')::timestamp <= ?", [filter.endDate])
    }

    if (filter.createdBy) {
      query.where("r.created_by", filter.createdBy)
    }

    // Get total count for pagination
    const countQuery = query.clone()
    const { count } = await countQuery.count("r.id as count").first()

    // Apply pagination
    const offset = (page - 1) * limit
    query.orderBy("r.created_at", "desc").offset(offset).limit(limit)

    // Execute query
    const reports = await query

    return {
      reports,
      total: Number.parseInt(count),
      page,
      limit,
    }
  },

  /**
   * Create a new report
   * @param {Object} reportData - Report data
   * @returns {Promise<Object>} - Created report object
   */
  create: async (reportData) => {
    // Insert report
    const [id] = await db("reports")
      .insert({
        name: reportData.name,
        type: reportData.type,
        format: reportData.format || "pdf",
        date_range: JSON.stringify(reportData.dateRange),
        filters: reportData.filters ? JSON.stringify(reportData.filters) : null,
        created_by: reportData.createdBy,
        file_url: reportData.fileUrl,
        is_scheduled: reportData.isScheduled || false,
        schedule: reportData.schedule ? JSON.stringify(reportData.schedule) : null,
      })
      .returning("id")

    // Return created report
    return await Report.findById(id)
  },

  /**
   * Update a report
   * @param {string} id - Report ID
   * @param {Object} reportData - Report data to update
   * @returns {Promise<Object>} - Updated report object
   */
  update: async (id, reportData) => {
    // Prepare update data
    const updateData = {}

    if (reportData.name) updateData.name = reportData.name
    if (reportData.type) updateData.type = reportData.type
    if (reportData.format) updateData.format = reportData.format
    if (reportData.dateRange) updateData.date_range = JSON.stringify(reportData.dateRange)
    if (reportData.filters) updateData.filters = JSON.stringify(reportData.filters)
    if (reportData.fileUrl) updateData.file_url = reportData.fileUrl
    if (reportData.isScheduled !== undefined) updateData.is_scheduled = reportData.isScheduled
    if (reportData.schedule) updateData.schedule = JSON.stringify(reportData.schedule)

    // Update report
    await db("reports").where({ id }).update(updateData)

    // Return updated report
    return await Report.findById(id)
  },

  /**
   * Delete a report
   * @param {string} id - Report ID
   * @returns {Promise<boolean>} - Success status
   */
  delete: async (id) => {
    const deleted = await db("reports").where({ id }).delete()

    return deleted > 0
  },

  /**
   * Get scheduled reports that need to be run
   * @returns {Promise<Array>} - Array of reports to run
   */
  getScheduledReportsToRun: async () => {
    const now = new Date()

    return await db("reports")
      .where("is_scheduled", true)
      .whereRaw("(schedule->>'nextRun')::timestamp <= ?", [now])
      .orderBy("created_at", "asc")
  },

  /**
   * Update next run time for a scheduled report
   * @param {string} id - Report ID
   * @param {Date} lastRun - Last run timestamp
   * @param {Date} nextRun - Next run timestamp
   * @returns {Promise<Object>} - Updated report
   */
  updateSchedule: async (id, lastRun, nextRun) => {
    // Get current schedule
    const report = await Report.findById(id)
    const schedule = report.schedule || {}

    // Update schedule
    schedule.lastRun = lastRun
    schedule.nextRun = nextRun

    // Update report
    await db("reports")
      .where({ id })
      .update({
        schedule: JSON.stringify(schedule),
      })

    // Return updated report
    return await Report.findById(id)
  },
}

module.exports = Report
