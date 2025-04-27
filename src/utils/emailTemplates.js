/**
 * Welcome email template
 * @param {string} name - User's name
 * @returns {string} - HTML email content
 */
exports.welcomeEmail = (name) => {
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to the Attendance System!</h2>
        <p>Hello ${name},</p>
        <p>Thank you for joining our attendance system. We're excited to have you on board!</p>
        <p>With our system, you can:</p>
        <ul>
          <li>Check in and out using QR codes</li>
          <li>View your attendance history</li>
          <li>Request time off</li>
          <li>And much more!</li>
        </ul>
        <p>If you have any questions, please don't hesitate to contact your administrator.</p>
        <p>Best regards,<br>The Attendance System Team</p>
      </div>
    `
}

/**
 * Attendance confirmation email template
 * @param {string} name - User's name
 * @param {string} type - Check-in or check-out
 * @param {string} timestamp - Formatted timestamp
 * @param {string} status - Attendance status
 * @returns {string} - HTML email content
 */
exports.attendanceConfirmationEmail = (name, type, timestamp, status) => {
  const typeText = type === "check-in" ? "Check-in" : "Check-out"
  const statusColor = status === "valid" ? "green" : status === "suspicious" ? "orange" : "red"

  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Attendance ${typeText} Confirmation</h2>
        <p>Hello ${name},</p>
        <p>Your attendance has been recorded successfully:</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
          <p><strong>Type:</strong> ${typeText}</p>
          <p><strong>Time:</strong> ${timestamp}</p>
          <p><strong>Status:</strong> <span style="color: ${statusColor};">${status}</span></p>
        </div>
        <p>If you did not perform this action or notice any discrepancies, please contact your administrator immediately.</p>
        <p>Best regards,<br>The Attendance System Team</p>
      </div>
    `
}

/**
 * Location alert email template
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @param {string} type - Check-in or check-out
 * @param {string} timestamp - Formatted timestamp
 * @param {Object} location - Location coordinates
 * @returns {string} - HTML email content
 */
exports.locationAlertEmail = (name, email, type, timestamp, location) => {
  const typeText = type === "check-in" ? "Check-in" : "Check-out"
  const locationText = location ? `${location.latitude}, ${location.longitude}` : "Unknown"
  const mapLink = location ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}` : "#"

  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d9534f;">Suspicious Attendance Location Alert</h2>
        <p>An attendance record was created from a suspicious location:</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
          <p><strong>Employee:</strong> ${name} (${email})</p>
          <p><strong>Type:</strong> ${typeText}</p>
          <p><strong>Time:</strong> ${timestamp}</p>
          <p><strong>Location:</strong> ${locationText}</p>
          <p><a href="${mapLink}" target="_blank">View on Map</a></p>
        </div>
        <p>Please investigate this activity and take appropriate action if necessary.</p>
        <p>Best regards,<br>The Attendance System Team</p>
      </div>
    `
}

/**
 * Password reset email template
 * @param {string} name - User's name
 * @param {string} resetUrl - Password reset URL
 * @returns {string} - HTML email content
 */
exports.passwordResetEmail = (name, resetUrl) => {
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hello ${name},</p>
        <p>You are receiving this email because you (or someone else) has requested a password reset for your account.</p>
        <p>Please click the button below to reset your password:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        </div>
        <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
        <p>This link will expire in 10 minutes.</p>
        <p>Best regards,<br>The Attendance System Team</p>
      </div>
    `
}

/**
 * Password change confirmation email template
 * @param {string} name - User's name
 * @returns {string} - HTML email content
 */
exports.passwordChangeEmail = (name) => {
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Changed Successfully</h2>
        <p>Hello ${name},</p>
        <p>Your password has been changed successfully.</p>
        <p>If you did not make this change, please contact your administrator immediately.</p>
        <p>Best regards,<br>The Attendance System Team</p>
      </div>
    `
}

/**
 * Report email template
 * @param {string} reportName - Report name
 * @param {string} reportType - Report type
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {string} - HTML email content
 */
exports.reportEmail = (reportName, reportType, startDate, endDate) => {
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Attendance Report</h2>
        <p>Hello,</p>
        <p>Please find attached the requested attendance report:</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
          <p><strong>Report Name:</strong> ${reportName}</p>
          <p><strong>Report Type:</strong> ${reportType}</p>
          <p><strong>Date Range:</strong> ${startDate} to ${endDate}</p>
        </div>
        <p>The report is attached to this email.</p>
        <p>Best regards,<br>The Attendance System Team</p>
      </div>
    `
}
