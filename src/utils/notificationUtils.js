const transporter = require("../config/email")

/**
 * Sends a notification email related to a leave request.
 * @param {object} leaveRequest - The leave request object.
 * @param {string} recipientEmail - The email address of the recipient.
 * @param {string} subject - The subject of the email.
 * @param {string} message - The main message content of the email.
 */
const sendLeaveNotification = async (leaveRequest, recipientEmail, subject, message) => {
  try {
    // In a real application, you would use more sophisticated HTML templates
    const mailOptions = {
      from: process.env.EMAIL_FROM || "noreply@example.com",
      to: recipientEmail,
      subject: subject,
      html: `
        <h1>Leave Request Update</h1>
        <p>${message}</p>
        <hr>
        <p><strong>Request ID:</strong> ${leaveRequest.id}</p>
        <p><strong>Employee:</strong> ${leaveRequest.user_name}</p>
        <p><strong>Type:</strong> ${leaveRequest.type}</p>
        <p><strong>Dates:</strong> ${new Date(leaveRequest.start_date).toLocaleDateString()} to ${new Date(leaveRequest.end_date).toLocaleDateString()}</p>
        <p><strong>New Status:</strong> ${leaveRequest.status}</p>
      `,
    }

    await transporter.sendMail(mailOptions)
    console.log(`Leave notification email sent successfully to ${recipientEmail}`)
  } catch (error) {
    console.error(`Error sending leave notification email to ${recipientEmail}:`, error.message)
    // We don't re-throw the error to prevent the main application flow from breaking.
    // In a production environment, this should be logged to a proper monitoring service.
  }
}

module.exports = {
  sendLeaveNotification,
} 