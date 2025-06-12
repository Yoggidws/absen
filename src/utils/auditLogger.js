const { db } = require("../config/db")

/**
 * Audit Logger for Role and Permission System
 * Tracks all authorization events for security and compliance
 */

const AUDIT_EVENTS = {
  PERMISSION_CHECK: 'permission_check',
  ROLE_CHECK: 'role_check',
  ACCESS_GRANTED: 'access_granted',
  ACCESS_DENIED: 'access_denied',
  ROLE_ASSIGNED: 'role_assigned',
  ROLE_REMOVED: 'role_removed',
  PERMISSION_GRANTED: 'permission_granted',
  PERMISSION_REVOKED: 'permission_revoked',
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  UNAUTHORIZED_ACCESS: 'unauthorized_access'
}

/**
 * Log an audit event
 * @param {Object} auditData - Audit event data
 */
const logAuditEvent = async (auditData) => {
  try {
    const {
      userId,
      event,
      resource,
      action,
      result,
      details = {},
      ipAddress,
      userAgent,
      timestamp = new Date()
    } = auditData

    // Create audit record
    await db('audit_logs').insert({
      id: generateAuditId(),
      user_id: userId,
      event,
      resource,
      action,
      result,
      details: JSON.stringify(details),
      ip_address: ipAddress,
      user_agent: userAgent,
      timestamp
    })

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUDIT] ${event}: ${result} - User: ${userId}, Resource: ${resource}, Action: ${action}`)
    }

  } catch (error) {
    console.error('Failed to log audit event:', error)
    // Don't throw error to avoid breaking the main flow
  }
}

/**
 * Log permission check
 * @param {Object} req - Express request object
 * @param {string} permission - Permission being checked
 * @param {boolean} granted - Whether permission was granted
 */
const logPermissionCheck = async (req, permission, granted) => {
  await logAuditEvent({
    userId: req.user?.id,
    event: AUDIT_EVENTS.PERMISSION_CHECK,
    resource: permission,
    action: 'check',
    result: granted ? 'granted' : 'denied',
    details: {
      userRoles: req.userRoles?.map(r => r.name),
      userPermissions: req.userPermissions?.map(p => p.name),
      requestPath: req.path,
      requestMethod: req.method
    },
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent')
  })
}

/**
 * Log role check
 * @param {Object} req - Express request object
 * @param {string} role - Role being checked
 * @param {boolean} granted - Whether role check passed
 */
const logRoleCheck = async (req, role, granted) => {
  await logAuditEvent({
    userId: req.user?.id,
    event: AUDIT_EVENTS.ROLE_CHECK,
    resource: role,
    action: 'check',
    result: granted ? 'granted' : 'denied',
    details: {
      userRoles: req.userRoles?.map(r => r.name),
      requestPath: req.path,
      requestMethod: req.method
    },
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent')
  })
}

/**
 * Log access attempt
 * @param {Object} req - Express request object
 * @param {string} resource - Resource being accessed
 * @param {boolean} granted - Whether access was granted
 */
const logAccessAttempt = async (req, resource, granted) => {
  await logAuditEvent({
    userId: req.user?.id,
    event: granted ? AUDIT_EVENTS.ACCESS_GRANTED : AUDIT_EVENTS.ACCESS_DENIED,
    resource,
    action: req.method,
    result: granted ? 'success' : 'denied',
    details: {
      path: req.path,
      query: req.query,
      body: req.method === 'POST' || req.method === 'PUT' ? 
        sanitizeBody(req.body) : undefined
    },
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent')
  })
}

/**
 * Log role assignment/removal
 * @param {string} targetUserId - User receiving role change
 * @param {string} actorUserId - User making the change
 * @param {string} roleId - Role being assigned/removed
 * @param {string} action - 'assigned' or 'removed'
 */
const logRoleChange = async (targetUserId, actorUserId, roleId, action) => {
  await logAuditEvent({
    userId: actorUserId,
    event: action === 'assigned' ? AUDIT_EVENTS.ROLE_ASSIGNED : AUDIT_EVENTS.ROLE_REMOVED,
    resource: 'user_role',
    action,
    result: 'success',
    details: {
      targetUserId,
      roleId,
      action
    }
  })
}

/**
 * Log login attempt
 * @param {string} email - User email
 * @param {boolean} success - Whether login was successful
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User agent
 * @param {string} userId - User ID (if successful)
 */
const logLoginAttempt = async (email, success, ipAddress, userAgent, userId = null) => {
  await logAuditEvent({
    userId,
    event: success ? AUDIT_EVENTS.LOGIN_SUCCESS : AUDIT_EVENTS.LOGIN_FAILED,
    resource: 'authentication',
    action: 'login',
    result: success ? 'success' : 'failed',
    details: {
      email,
      loginMethod: 'password'
    },
    ipAddress,
    userAgent
  })
}

/**
 * Get audit logs with filtering
 * @param {Object} filters - Filter criteria
 * @returns {Array} - Audit logs
 */
const getAuditLogs = async (filters = {}) => {
  const {
    userId,
    event,
    resource,
    result,
    startDate,
    endDate,
    limit = 100,
    offset = 0
  } = filters

  let query = db('audit_logs as al')
    .leftJoin('users as u', 'al.user_id', 'u.id')
    .select(
      'al.*',
      'u.name as user_name',
      'u.email as user_email'
    )
    .orderBy('al.timestamp', 'desc')
    .limit(limit)
    .offset(offset)

  if (userId) query = query.where('al.user_id', userId)
  if (event) query = query.where('al.event', event)
  if (resource) query = query.where('al.resource', 'ilike', `%${resource}%`)
  if (result) query = query.where('al.result', result)
  if (startDate) query = query.where('al.timestamp', '>=', startDate)
  if (endDate) query = query.where('al.timestamp', '<=', endDate)

  return await query
}

/**
 * Get audit statistics
 * @param {Object} filters - Filter criteria
 * @returns {Object} - Audit statistics
 */
const getAuditStats = async (filters = {}) => {
  const { startDate, endDate } = filters

  let baseQuery = db('audit_logs')
  if (startDate) baseQuery = baseQuery.where('timestamp', '>=', startDate)
  if (endDate) baseQuery = baseQuery.where('timestamp', '<=', endDate)

  const [
    totalEvents,
    eventsByType,
    eventsByResult,
    topUsers,
    topResources
  ] = await Promise.all([
    // Total events
    baseQuery.clone().count('* as count').first(),
    
    // Events by type
    baseQuery.clone()
      .select('event')
      .count('* as count')
      .groupBy('event')
      .orderBy('count', 'desc'),
    
    // Events by result
    baseQuery.clone()
      .select('result')
      .count('* as count')
      .groupBy('result')
      .orderBy('count', 'desc'),
    
    // Top users by activity
    baseQuery.clone()
      .join('users as u', 'audit_logs.user_id', 'u.id')
      .select('u.name', 'u.email')
      .count('* as count')
      .groupBy('u.id', 'u.name', 'u.email')
      .orderBy('count', 'desc')
      .limit(10),
    
    // Top accessed resources
    baseQuery.clone()
      .select('resource')
      .count('* as count')
      .groupBy('resource')
      .orderBy('count', 'desc')
      .limit(10)
  ])

  return {
    totalEvents: parseInt(totalEvents.count),
    eventsByType,
    eventsByResult,
    topUsers,
    topResources
  }
}

/**
 * Generate unique audit ID
 * @returns {string} - Unique audit ID
 */
const generateAuditId = () => {
  return 'AUDIT-' + Math.random().toString(36).substring(2, 10).toUpperCase()
}

/**
 * Sanitize request body for logging (remove sensitive data)
 * @param {Object} body - Request body
 * @returns {Object} - Sanitized body
 */
const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') return body

  const sanitized = { ...body }
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth']
  
  Object.keys(sanitized).forEach(key => {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      sanitized[key] = '[REDACTED]'
    }
  })
  
  return sanitized
}

module.exports = {
  AUDIT_EVENTS,
  logAuditEvent,
  logPermissionCheck,
  logRoleCheck,
  logAccessAttempt,
  logRoleChange,
  logLoginAttempt,
  getAuditLogs,
  getAuditStats
} 