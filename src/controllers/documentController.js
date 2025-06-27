const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")
const path = require("path")
const { v4: uuidv4 } = require("uuid")
const storageService = require("../services/storageService")
const { logAuditEvent } = require("../utils/auditLogger")

/**
 * @desc    Upload a document
 * @route   POST /api/documents
 * @access  Private
 */
const uploadDocument = asyncHandler(async (req, res) => {
  try {
    // Check if file is uploaded
    if (!req.file) {
      res.status(400);
      throw new Error("Please upload a file");
    }

    // Validate file size (e.g., 10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (req.file.size > MAX_FILE_SIZE) {
      res.status(400);
      throw new Error("File size too large. Maximum size is 10MB");
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'text/plain'
    ];
    
    if (!allowedTypes.includes(req.file.mimetype)) {
      res.status(400);
      throw new Error("Invalid file type. Please upload a valid document");
    }

    console.log('Uploading file:', {
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    const fileKey = await storageService.uploadFile(req.file, 'documents');
    console.log('File uploaded successfully, key:', fileKey);

    const { title, description, type, expiry_date, status } = req.body;

    // Determine user ID (admin can upload for other users)
    let userId = req.user.id;
    if (req.body.userId && req.hasPermission('upload:document:all')) {
      // Verify the user exists
      const userExists = await db("users").where({ id: req.body.userId }).first();
      if (!userExists) {
        // Delete the uploaded file if user doesn't exist
        await storageService.deleteFile(fileKey);
        res.status(404);
        throw new Error("User not found");
      }
      userId = req.body.userId;
    }

    // Generate a unique ID for the document
    const documentId = "DOC-" + Math.random().toString(36).substring(2, 10).toUpperCase();

    // Create document record in database
    const [document] = await db("documents")
      .insert({
        id: documentId,
        title: title || req.file.originalname,
        description: description || "",
        type: type || "other",
        file_path: fileKey,
        file_name: req.file.originalname,
        file_type: req.file.mimetype,
        file_size: req.file.size,
        user_id: userId,
        uploaded_by: req.user.id,
        expiry_date: expiry_date || null,
        status: status || "active",
      })
      .returning("*");

    await logAuditEvent({
      action: 'upload_document',
      user_id: req.user.id,
      resource: 'document',
      resource_id: document.id,
      details: { 
        title: document.title, 
        file_name: document.file_name, 
        file_size: document.file_size,
        file_type: document.file_type,
        for_user_id: userId 
      }
    });

    res.status(201).json({
      success: true,
      data: document,
    });
  } catch (error) {
    console.error('Error in document upload:', error);
    // If there was an error and we uploaded a file, try to delete it
    if (error.fileKey) {
      try {
        await storageService.deleteFile(error.fileKey);
      } catch (deleteError) {
        console.error('Error deleting file after failed upload:', deleteError);
      }
    }
    throw error;
  }
})

/**
 * @desc    Get documents for the current user
 * @route   GET /api/documents/me
 * @access  Private
 */
const getMyDocuments = asyncHandler(async (req, res) => {
  const { status, type, search } = req.query;
  let query = db("documents")
    .where({ user_id: req.user.id })
    .orderBy("created_at", "desc");
  
  // Apply filters
  if (status) query.where({ status });
  if (type) query.where({ type });
  if (search) {
    query.where(function() {
      this.where('title', 'ilike', `%${search}%`)
          .orWhere('description', 'ilike', `%${search}%`)
          .orWhere('file_name', 'ilike', `%${search}%`);
    });
  }

  const documents = await query;
  res.status(200).json({ success: true, count: documents.length, data: documents });
})

/**
 * @desc    Get all documents (for admins)
 * @route   GET /api/documents
 * @access  Private/Admin
 */
const getDocuments = asyncHandler(async (req, res) => {
  const { status, type, search, userId } = req.query;
  let query = db("documents").orderBy("created_at", "desc");

  // This controller is for admins to get all documents or filter by a user
  if (!req.hasPermission('read:document:all')) {
    res.status(403);
    throw new Error('Forbidden: You do not have permission to view all documents.');
  }
  
  if (userId) {
    query = query.where({ user_id: userId });
  }
  
  // Apply filters
  if (status) query.where({ status });
  if (type) query.where({ type });
  if (search) {
    query.where(function() {
      this.where('title', 'ilike', `%${search}%`)
          .orWhere('description', 'ilike', `%${search}%`)
          .orWhere('file_name', 'ilike', `%${search}%`);
    });
  }

  const documents = await query;
  res.status(200).json({ success: true, count: documents.length, data: documents });
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

  try {
    const downloadUrl = await storageService.getSignedUrl(document.file_path);

    await logAuditEvent({
      action: 'download_document',
      user_id: req.user.id,
      resource: 'document',
      resource_id: document.id,
      details: { file_name: document.file_name }
    });
    
    // Redirect the user to the signed URL
    res.redirect(downloadUrl);
  } catch (error) {
    console.error("Error generating signed URL for download:", error);
    res.status(500).json({ success: false, message: "Could not generate download link." });
  }
})

/**
 * @desc    Update document metadata
 * @route   PUT /api/documents/:id
 * @access  Private
 */
const updateDocument = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { title, description, type, expiry_date, status } = req.body

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

  const updateData = { updated_at: db.fn.now() };
  if (title) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (type) updateData.type = type;
  if (expiry_date !== undefined) updateData.expiry_date = expiry_date;
  if (status) updateData.status = status;

  // Update document
  const [updatedDocument] = await db("documents")
    .where({ id })
    .update(updateData)
    .returning("*")

  await logAuditEvent({
    action: 'update_document',
    user_id: req.user.id,
    resource: 'document',
    resource_id: document.id,
    details: { changes: req.body }
  });

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

  // Use storage service to delete the file
  await storageService.deleteFile(document.file_path) 

  // Delete document from database
  await db("documents").where({ id }).del()

  await logAuditEvent({
    action: 'delete_document',
    user_id: req.user.id,
    resource: 'document',
    resource_id: id,
    details: { title: document.title, file_name: document.file_name }
  });

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
    const downloadUrl = await storageService.getSignedUrl(document.file_path);
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
    getMyDocuments,
    getDocumentById,
    downloadDocument,
    updateDocument,
    deleteDocument,
    getDocumentStats,
    getDocumentsForUser,
    getSignedUrlForDocument
}
