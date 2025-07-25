const express = require("express")
const router = express.Router()
const multer = require("multer")
const path = require("path")
const { v4: uuidv4 } = require("uuid")
const {
  uploadDocument,
  getDocuments,
  getDocumentById,
  downloadDocument,
  updateDocument,
  deleteDocument,
  getDocumentStats,
  getSignedUrlForDocument,
  getDocumentsForUser,
  getMyDocuments,
} = require("../controllers/documentController")
const { enhancedProtect } = require("../middlewares/enhancedAuthMiddleware")
const { rbac, clearAllPermissionCache } = require("../middlewares/rbacMiddleware")

// Configure multer for file uploads
const storage = multer.memoryStorage()

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
router.post("/", enhancedProtect, rbac.can("upload:document:own"), upload.single("file"), uploadDocument)
router.get("/", enhancedProtect, rbac.can("read:document:all"), getDocuments)
router.get("/me", enhancedProtect, rbac.can("read:document:own"), getMyDocuments)
router.get("/stats", enhancedProtect, rbac.can("read:document:all"), getDocumentStats)
router.get("/user/:userId", enhancedProtect, rbac.can("read:document:all"), getDocumentsForUser)
router.get("/:id", enhancedProtect, getDocumentById)
router.get("/:id/download", enhancedProtect, downloadDocument)
router.put("/:id", enhancedProtect, rbac.can("update:document:own"), updateDocument)
router.delete("/:id", enhancedProtect, rbac.can("delete:document:own"), deleteDocument)
router.get("/:id/signed-url", enhancedProtect, getSignedUrlForDocument)

// Admin route to clear cache
router.post("/clear-cache", enhancedProtect, rbac.can("manage:roles"), (req, res) => {
    clearAllPermissionCache();
    res.status(200).json({ success: true, message: "Permission cache cleared." });
});

module.exports = router
