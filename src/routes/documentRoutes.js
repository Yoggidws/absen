const express = require("express")
const router = express.Router()
const multer = require("multer")
const path = require("path")
const fs = require("fs") // Import the 'fs' module
const { v4: uuidv4 } = require("uuid")
const {
  uploadDocument,
  getDocuments,
  getDocumentById,
  downloadDocument,
  updateDocument,
  deleteDocument,
  getDocumentStats,
} = require("../controllers/documentController")
const { protect, admin } = require("../middlewares/authMiddleware")

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../../uploads")
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueFilename = `${uuidv4()}-${file.originalname}`
    cb(null, uniqueFilename)
  },
})

// File filter to restrict file types
const fileFilter = (req, file, cb) => {
  // Accept common document types
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
    "text/plain",
  ]

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error("Invalid file type. Only PDF, Word, Excel, images, and text files are allowed."), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
})

// Protected routes
router.post("/", protect, upload.single("file"), uploadDocument)
router.get("/", protect, getDocuments)
router.get("/stats", protect, admin, getDocumentStats)
router.get("/:id", protect, getDocumentById)
router.get("/:id/download", protect, downloadDocument)
router.put("/:id", protect, updateDocument)
router.delete("/:id", protect, deleteDocument)

module.exports = router
