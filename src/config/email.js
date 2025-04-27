require("dotenv").config()

const nodemailer = require("nodemailer")

// Create reusable transporter object using SMTP transport
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
})

// Verify connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error("Email service error:", error)
  } else {
    console.log("Email server is ready to send messages")
  }
})

module.exports = transporter
