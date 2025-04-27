const nodemailer = require("nodemailer")

/**
 * Create email transporter
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  })
}

/**
 * Send welcome email to new user
 * @param {Object} user - User object
 */
exports.sendWelcomeEmail = async (user) => {
  // Skip in test environment
  if (process.env.NODE_ENV === "test") return

  try {
    const transporter = createTransporter()

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: "Welcome to Attendance System",
      html: `
       <h1>Welcome to Attendance System</h1>
       <p>Hello ${user.name},</p>
       <p>Your account has been created successfully.</p>
       <p>You can now log in to the system using your email and password.</p>
       <p>Thank you for joining us!</p>
     `,
    })
  } catch (error) {
    console.error("Email sending failed:", error)
  }
}

/**
 * Send password reset email
 * @param {Object} user - User object
 * @param {string} resetUrl - Password reset URL
 */
exports.sendPasswordResetEmail = async (user, resetUrl) => {
  // Skip in test environment
  if (process.env.NODE_ENV === "test") return

  const transporter = createTransporter()

  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
    to: user.email,
    subject: "Password Reset",
    html: `
     <h1>Password Reset</h1>
     <p>Hello ${user.name},</p>
     <p>You requested a password reset. Please click the link below to reset your password:</p>
     <p><a href="${resetUrl}">Reset Password</a></p>
     <p>This link will expire in 10 minutes.</p>
     <p>If you did not request this, please ignore this email.</p>
   `,
  })
}

/**
 * Send attendance confirmation email
 * @param {Object} user - User object
 * @param {Object} attendance - Attendance record
 */
exports.sendAttendanceConfirmationEmail = async (user, attendance) => {
  // Skip in test environment
  if (process.env.NODE_ENV === "test") return

  try {
    const transporter = createTransporter()

    const timestamp = new Date(attendance.timestamp).toLocaleString()
    const type = attendance.type === "check-in" ? "Check-in" : "Check-out"

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: `Attendance ${type} Confirmation`,
      html: `
       <h1>Attendance ${type} Confirmation</h1>
       <p>Hello ${user.name},</p>
       <p>Your ${type.toLowerCase()} has been recorded successfully.</p>
       <p><strong>Time:</strong> ${timestamp}</p>
       <p><strong>Status:</strong> ${attendance.status}</p>
       ${attendance.notes ? `<p><strong>Notes:</strong> ${attendance.notes}</p>` : ""}
       <p>Thank you!</p>
     `,
    })
  } catch (error) {
    console.error("Email sending failed:", error)
  }
}

/**
 * Send location alert email to admins
 * @param {Array} adminEmails - Array of admin email addresses
 * @param {Object} user - User object
 * @param {Object} attendanceData - Attendance data
 */
exports.sendLocationAlertEmail = async (adminEmails, user, attendanceData) => {
  // Skip in test environment
  if (process.env.NODE_ENV === "test") return

  try {
    const transporter = createTransporter()

    const timestamp = new Date(attendanceData.timestamp).toLocaleString()
    const type = attendanceData.type === "check-in" ? "Check-in" : "Check-out"

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: adminEmails.join(","),
      subject: `Suspicious Location Alert - ${user.name}`,
      html: `
       <h1>Suspicious Location Alert</h1>
       <p><strong>User:</strong> ${user.name} (${user.email})</p>
       <p><strong>Action:</strong> ${type}</p>
       <p><strong>Time:</strong> ${timestamp}</p>
       <p><strong>Location:</strong> Latitude: ${attendanceData.location.latitude}, Longitude: ${attendanceData.location.longitude}</p>
       <p><strong>IP Address:</strong> ${attendanceData.ipAddress}</p>
       <p><strong>Device Info:</strong> ${attendanceData.deviceInfo || "Not provided"}</p>
       <p>This location is outside the allowed radius for attendance.</p>
     `,
    })
  } catch (error) {
    console.error("Email sending failed:", error)
  }
}

/**
 * Send leave request notification to manager
 * @param {Object} leaveRequest - Leave request object
 * @param {Object} employee - Employee object
 * @param {Object} manager - Manager object
 */
exports.sendLeaveRequestNotification = async (leaveRequest, employee, manager) => {
  // Skip in test environment
  if (process.env.NODE_ENV === "test") return

  try {
    const transporter = createTransporter()

    const startDate = new Date(leaveRequest.start_date).toLocaleDateString()
    const endDate = new Date(leaveRequest.end_date).toLocaleDateString()

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: manager.email,
      subject: `Leave Request from ${employee.name}`,
      html: `
        <h1>New Leave Request</h1>
        <p>Hello ${manager.name},</p>
        <p>A new leave request has been submitted by ${employee.name} and requires your approval.</p>
        <p><strong>Leave Type:</strong> ${leaveRequest.type}</p>
        <p><strong>Period:</strong> ${startDate} to ${endDate}</p>
        <p><strong>Reason:</strong> ${leaveRequest.reason}</p>
        <p>Please log in to the system to approve or reject this request.</p>
        <p>Thank you!</p>
      `,
    })
  } catch (error) {
    console.error("Email sending failed:", error)
  }
}

/**
 * Send leave request status update to employee
 * @param {Object} leaveRequest - Leave request object
 * @param {Object} employee - Employee object
 * @param {string} status - Status of the leave request
 * @param {Object} approver - Approver object
 * @param {number} approvalLevel - Approval level
 */
exports.sendLeaveStatusUpdate = async (leaveRequest, employee, status, approver, approvalLevel) => {
  // Skip in test environment
  if (process.env.NODE_ENV === "test") return

  try {
    const transporter = createTransporter()

    const startDate = new Date(leaveRequest.start_date).toLocaleDateString()
    const endDate = new Date(leaveRequest.end_date).toLocaleDateString()
    const statusCapitalized = status.charAt(0).toUpperCase() + status.slice(1)

    // Get the approver level text
    let approverLevelText = "Manager";
    if (approvalLevel === 2) {
      approverLevelText = "HR";
    } else if (approvalLevel === 3) {
      approverLevelText = "Admin";
    }

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: employee.email,
      subject: `Leave Request ${statusCapitalized}`,
      html: `
        <h1>Leave Request ${statusCapitalized}</h1>
        <p>Hello ${employee.name},</p>
        <p>Your leave request has been <strong>${status}</strong> by ${approver.name} (${approverLevelText}).</p>
        <p><strong>Leave Type:</strong> ${leaveRequest.type}</p>
        <p><strong>Period:</strong> ${startDate} to ${endDate}</p>
        ${leaveRequest.approval_notes ? `<p><strong>Notes:</strong> ${leaveRequest.approval_notes}</p>` : ""}
        ${status === "approved" && approvalLevel < 3 ?
          `<p>Your request is now pending approval from the next level.</p>` : ""}
        <p>Thank you!</p>
      `,
    })
  } catch (error) {
    console.error("Email sending failed:", error)
  }
}

/**
 * Send payslip email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} period - Payroll period
 * @param {string} attachmentPath - Path to payslip PDF
 */
/**
 * Send leave approval notification to approver
 * @param {Object} leaveRequest - Leave request object
 * @param {Object} approver - Approver object
 * @param {number} approvalLevel - Approval level (1=Manager, 2=HR, 3=Admin)
 */
exports.sendLeaveApprovalNotification = async (leaveRequest, approver, approvalLevel) => {
  // Skip in test environment
  if (process.env.NODE_ENV === "test") return

  try {
    const transporter = createTransporter()

    const startDate = new Date(leaveRequest.start_date).toLocaleDateString()
    const endDate = new Date(leaveRequest.end_date).toLocaleDateString()

    // Get the approver level text
    let approverLevelText = "Department Manager";
    if (approvalLevel === 2) {
      approverLevelText = "HR Manager";
    } else if (approvalLevel === 3) {
      approverLevelText = "Admin";
    }

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: approver.email,
      subject: `Leave Request Approval Required (Level ${approvalLevel})`,
      html: `
        <h1>Leave Request Approval Required</h1>
        <p>Hello ${approver.name},</p>
        <p>A leave request requires your approval as the <strong>${approverLevelText}</strong>.</p>
        <p><strong>Employee:</strong> ${leaveRequest.user_name}</p>
        <p><strong>Leave Type:</strong> ${leaveRequest.type}</p>
        <p><strong>Period:</strong> ${startDate} to ${endDate}</p>
        <p><strong>Reason:</strong> ${leaveRequest.reason}</p>
        <p>Please log in to the system to approve or reject this request.</p>
        <p>Thank you!</p>
      `,
    })
  } catch (error) {
    console.error("Email sending failed:", error)
  }
}

exports.sendPayslipEmail = async (email, name, period, attachmentPath) => {
  // Skip in test environment
  if (process.env.NODE_ENV === "test") return

  try {
    const transporter = createTransporter()

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: `Your Payslip for ${period}`,
      html: `
        <h1>Payslip for ${period}</h1>
        <p>Hello ${name},</p>
        <p>Please find attached your payslip for the period ${period}.</p>
        <p>If you have any questions regarding your payslip, please contact the HR department.</p>
        <p>Thank you!</p>
      `,
      attachments: [
        {
          filename: `Payslip-${period.replace(/\s+/g, "-")}.pdf`,
          path: attachmentPath,
        },
      ],
    })
  } catch (error) {
    console.error("Email sending failed:", error)
  }
}
