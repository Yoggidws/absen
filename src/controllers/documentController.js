const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const path = require("path")
const fs = require("fs")
const { v4: uuidv4 } = require("uuid")

/**
 * @desc    Upload a document
 * @route   POST /api/documents
 * @access  Private
 */
exports.uploadDocument = asyncHandler(async (req, res) => {
  // Check if file is uploaded
  if (!req.file) {
    res.status(400)
    throw new Error("Please upload a file")
  }

  const { title, description, type } = req.body

  // Determine user ID (admin can upload for other users)
  let userId = req.user.id
  if (req.body.userId && req.user.role === "admin") {
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
 * @desc    Get all documents
 * @route   GET /api/documents
 * @access  Private
 */
exports.getDocuments = asyncHandler(async (req, res) => {
  const { type, userId } = req.query

  // Start building query
  let query = db("documents as d")
    .leftJoin("users as u", "d.user_id", "u.id")
    .leftJoin("users as up", "d.uploaded_by", "up.id")
    .select(
      "d.id",
      "d.title",
      "d.description",
      "d.type",
      "d.file_name",
      "d.file_type",
      "d.file_size",
      "d.created_at",
      "d.updated_at",
      "u.name as user_name",
      "u.email as user_email",
      "up.name as uploaded_by_name",
    )

  // Apply filters
  if (type) {
    query = query.where("d.type", type)
  }

  // If not admin, only show user's own documents
  if (req.user.role !== "admin") {
    query = query.where("d.user_id", req.user.id)
  } else if (userId) {
    // Admin can filter by user ID
    query = query.where("d.user_id", userId)
  }

  // Order by creation date
  query = query.orderBy("d.created_at", "desc")

  const documents = await query

  res.status(200).json({
    success: true,
    count: documents.length,
    data: documents,
  })
})

/**
 * @desc    Get document by ID
 * @route   GET /api/documents/:id
 * @access  Private
 */
exports.getDocumentById = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Get document with user information
  const document = await db("documents as d")
    .leftJoin("users as u", "d.user_id", "u.id")
    .leftJoin("users as up", "d.uploaded_by", "up.id")
    .select(
      "d.id",
      "d.title",
      "d.description",
      "d.type",
      "d.file_name",
      "d.file_type",
      "d.file_size",
      "d.file_path",
      "d.created_at",
      "d.updated_at",
      "d.user_id",
      "u.name as user_name",
      "u.email as user_email",
      "up.name as uploaded_by_name",
      "up.email as uploaded_by_email",
    )
    .where("d.id", id)
    .first()

  if (!document) {
    res.status(404)
    throw new Error("Document not found")
  }

  // Check if user has access to this document
  if (req.user.role !== "admin" && document.user_id !== req.user.id) {
    res.status(403)
    throw new Error("Not authorized to access this document")
  }

  res.status(200).json({
    success: true,
    data: document,
  })
})

/**
 * @desc    Download document
 * @route   GET /api/documents/:id/download
 * @access  Private
 */
exports.downloadDocument = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Get document
  const document = await db("documents").where({ id }).first()

  if (!document) {
    res.status(404)
    throw new Error("Document not found")
  }

  // Check if user has access to this document
  if (req.user.role !== "admin" && document.user_id !== req.user.id) {
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
exports.updateDocument = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { title, description, type } = req.body

  // Get document
  const document = await db("documents").where({ id }).first()

  if (!document) {
    res.status(404)
    throw new Error("Document not found")
  }

  // Check if user has access to update this document
  if (req.user.role !== "admin" && document.user_id !== req.user.id) {
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
exports.deleteDocument = asyncHandler(async (req, res) => {
  const { id } = req.params

  // Get document
  const document = await db("documents").where({ id }).first()

  if (!document) {
    res.status(404)
    throw new Error("Document not found")
  }

  // Check if user has access to delete this document
  if (req.user.role !== "admin" && document.user_id !== req.user.id) {
    res.status(403)
    throw new Error("Not authorized to delete this document")
  }

  // Delete file from storage
  if (fs.existsSync(document.file_path)) {
    fs.unlinkSync(document.file_path)
  }

  // Delete document from database
  await db("documents").where({ id }).delete()

  res.status(200).json({
    success: true,
    message: "Document deleted successfully",
  })
})

/**
 * @desc    Get document statistics
 * @route   GET /api/documents/stats
 * @access  Private/Admin
 */
exports.getDocumentStats = asyncHandler(async (req, res) => {
  // Only admins can access this endpoint
  if (req.user.role !== "admin") {
    res.status(403)
    throw new Error("Not authorized to access document statistics")
  }

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
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  res.status(200).json({
    success: true,
    stats: {
      total_documents: Number.parseInt(total, 10),
      storage_used: Number.parseInt(storage_used, 10),
      storage_used_formatted: formatBytes(storage_used),
      by_type: typeStats,
      by_user: userStats,
    },
  })
})
