const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const path = require("path")
const fs = require("fs")
const { v4: uuidv4 } = require("uuid")
const storageService = require("../services/storageService")

/**
 * @desc    Upload a document
 * @route   POST /api/documents
 * @access  Private
 */
const uploadDocument = asyncHandler(async (req, res) => {
  // Check if file is uploaded
  if (!req.file) {
    res.status(400)
    throw new Error("Please upload a file")
  }

  const { title, description, type } = req.body

  // Determine user ID (admin can upload for other users)
  let userId = req.user.id
  if (req.body.userId && req.hasPermission('upload:document:all')) {
    // Verify the user exists
    const userExists = await db("users").where({ id: req.body.userId }).first()
    if (!userExists) {
      res.status(404)
      throw new Error("User not found")
    }
    userId = req.body.userId
  }

  // Generate a unique ID for the document
  const documentId = "DOC-" + Math.random().toString(36).substring(2, 10).toUpperCase()

  // Create document record in database
  const [document] = await db("documents")
    .insert({
      id: documentId,
      title: title || req.file.originalname,
      description: description || "",
      type: type || "other",
      file_path: req.file.path,
      file_name: req.file.originalname,
      file_type: req.file.mimetype,
      file_size: req.file.size,
      user_id: userId,
      uploaded_by: req.user.id,
    })
    .returning("*")

  res.status(201).json({
    success: true,
    data: document,
  })
})

/**
 * @desc    Get all documents for self or all users
 * @route   GET /api/documents or GET /api/documents/me
 * @access  Private
 */
const getDocuments = asyncHandler(async (req, res) => {
  // If the route is for '/me', filter by current user
  if (req.path.includes('/me')) {
    const documents = await db("documents").where({ user_id: req.user.id }).orderBy("created_at", "desc")
    return res.status(200).json({ success: true, count: documents.length, data: documents })
  }

  // Check permission for getting all documents
  if (!req.hasPermission('read:document:all')) {
      res.status(403)
      throw new Error('Forbidden: You do not have permission to view all documents.')
  }

  const documents = await db("documents").orderBy("created_at", "desc")
  res.status(200).json({ success: true, count: documents.length, data: documents })
})

/**
 * @desc    Get document by ID
 * @route   GET /api/documents/:id
 * @access  Private
 */
const getDocumentById = asyncHandler(async (req, res) => {
  const { id } = req.params

  const document = await db("documents").where({ id }).first()

  if (!document) {
    res.status(404)
    throw new Error("Document not found")
  }

  // Check if user is owner or has permission to read all documents
  if (document.user_id !== req.user.id && !req.hasPermission("read:document:all")) {
    res.status(403)
    throw new Error("Forbidden: You do not have permission to view this document.")
  }

  res.status(200).json({ success: true, data: document })
})

/**
 * @desc    Download document
 * @route   GET /api/documents/:id/download
 * @access  Private
 */
const downloadDocument = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Get document
  const document = await db("documents").where({ id }).first()

  if (!document) {
    res.status(404)
    throw new Error("Document not found")
  }

  // Check if user has access to this document
  if (document.user_id !== req.user.id && !req.hasPermission("read:document:all")) {
    res.status(403)
    throw new Error("Not authorized to access this document")
  }

  // Check if file exists
  if (!fs.existsSync(document.file_path)) {
    res.status(404)
    throw new Error("File not found")
  }

  // Set headers for file download
  res.setHeader("Content-Disposition", `attachment; filename="${document.file_name}"`)
  res.setHeader("Content-Type", document.file_type)

  // Stream file to response
  const fileStream = fs.createReadStream(document.file_path)
  fileStream.pipe(res)
})

/**
 * @desc    Update document metadata
 * @route   PUT /api/documents/:id
 * @access  Private
 */
const updateDocument = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { title, description, type } = req.body

  // Get document
  const document = await db("documents").where({ id }).first()

  if (!document) {
    res.status(404)
    throw new Error("Document not found")
  }

  // Check if user has access to update this document
  const canUpdateAll = req.hasPermission('update:document:all');
  if (document.user_id !== req.user.id && !canUpdateAll) {
    res.status(403)
    throw new Error("Not authorized to update this document")
  }

  // Update document
  const [updatedDocument] = await db("documents")
    .where({ id })
    .update({
      title: title || document.title,
      description: description !== undefined ? description : document.description,
      type: type || document.type,
      updated_at: db.fn.now(),
    })
    .returning("*")

  res.status(200).json({
    success: true,
    data: updatedDocument,
  })
})

/**
 * @desc    Delete document
 * @route   DELETE /api/documents/:id
 * @access  Private
 */
const deleteDocument = asyncHandler(async (req, res) => {
  const { id } = req.params

  const document = await db("documents").where({ id }).first()

  if (!document) {
    res.status(404)
    throw new Error("Document not found")
  }

  // Check if user is owner or has permission to delete all documents
  if (document.user_id !== req.user.id && !req.hasPermission("delete:document:all")) {
    res.status(403)
    throw new Error("Forbidden: You do not have permission to delete this document.")
  }

  // Assuming storageService handles file deletion from disk/cloud
  // await storageService.deleteFile(document.file_key) 

  // Delete document from database
  await db("documents").where({ id }).del()

  res.status(200).json({ success: true, message: "Document deleted successfully" })
})

/**
 * @desc    Get document statistics
 * @route   GET /api/documents/stats
 * @access  Private/Admin
 */
const getDocumentStats = asyncHandler(async (req, res) => {
  // Get total document count
  const { total } = await db("documents").count("id as total").first()

  // Get document count by type
  const typeStats = await db("documents").select("type").count("id as count").groupBy("type").orderBy("count", "desc")

  // Get document count by user
  const userStats = await db("documents as d")
    .join("users as u", "d.user_id", "u.id")
    .select("d.user_id", "u.name as user_name", "u.email as user_email")
    .count("d.id as count")
    .groupBy("d.user_id", "u.name", "u.email")
    .orderBy("count", "desc")
    .limit(10)

  // Calculate total storage used
  const { storage_used } = await db("documents").sum("file_size as storage_used").first()

  // Format storage size
  const formatBytes = (bytes) => {
    if (bytes === null || bytes === undefined || bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  res.status(200).json({
    success: true,
    stats: {
      total_documents: Number.parseInt(total, 10),
      storage_used: Number.parseInt(storage_used, 10) || 0,
      storage_used_formatted: formatBytes(storage_used),
      by_type: typeStats,
      by_user: userStats,
    },
  })
})

/**
 * @desc    Get documents for a specific user
 * @route   GET /api/documents/user/:userId
 * @access  Private
 */
const getDocumentsForUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const documents = await db("documents").where({ user_id: userId }).orderBy("created_at", "desc");
    res.status(200).json({ success: true, count: documents.length, data: documents });
});

/**
 * @desc    Get a signed URL for a document
 * @route   GET /api/documents/:id/signed-url
 * @access  Private
 */
const getSignedUrlForDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const document = await db("documents").where({ id }).first();

  if (!document) {
    res.status(404);
    throw new Error("Document not found");
  }

  // Check if user is owner or has permission to read all documents
  if (document.user_id !== req.user.id && !req.hasPermission("read:document:all")) {
    res.status(403);
    throw new Error("Forbidden: You do not have permission to access this document.");
  }

  try {
    const downloadUrl = await storageService.getSignedUrl(document.file_key);
    res.status(200).json({ success: true, downloadUrl });
  } catch (error) {
    console.error("Error generating signed URL:", error);
    res.status(500);
    throw new Error("Could not generate download link for the document.");
  }
});

module.exports = {
    uploadDocument,
    getDocuments,
    getDocumentById,
    downloadDocument,
    updateDocument,
    deleteDocument,
    getDocumentStats,
    getDocumentsForUser,
    getSignedUrlForDocument
}
