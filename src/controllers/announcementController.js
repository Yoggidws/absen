const { db } = require("../config/db")
const { asyncHandler } = require("../middlewares/errorMiddleware")

// @desc    Get all announcements
// @route   GET /api/announcements
// @access  Public
exports.getAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await db("announcements")
    .orderBy("created_at", "desc")
    .select("*")

  res.status(200).json({
    success: true,
    count: announcements.length,
    data: announcements,
  })
})

// @desc    Create a new announcement
// @route   POST /api/announcements
// @access  Private/Admin
exports.createAnnouncement = asyncHandler(async (req, res) => {
  const { title, content } = req.body
  const userId = req.user.id

  if (!title || !content) {
    res.status(400)
    throw new Error("Title and content are required")
  }

  // Generate a unique ID for the announcement
  const announcementId =
    "ANN-" + Math.random().toString(36).substring(2, 10).toUpperCase()

  const [announcement] = await db("announcements")
    .insert({
      id: announcementId,
      title,
      content,
      user_id: userId,
    })
    .returning("*")

  res.status(201).json({
    success: true,
    data: announcement,
  })
})

// @desc    Update an announcement
// @route   PUT /api/announcements/:id
// @access  Private/Admin
exports.updateAnnouncement = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { title, content } = req.body
  const userId = req.user.id

  const announcement = await db("announcements").where({ id }).first()

  if (!announcement) {
    res.status(404)
    throw new Error("Announcement not found")
  }

  const updatedAnnouncement = await db("announcements")
    .where({ id })
    .update({
      title: title || announcement.title,
      content: content || announcement.content,
      user_id: userId, // Ensure the user_id is updated to the current admin making the change
      updated_at: db.fn.now(),
    })
    .returning("*")

  res.status(200).json({
    success: true,
    data: updatedAnnouncement[0],
  })
})

// @desc    Delete an announcement
// @route   DELETE /api/announcements/:id
// @access  Private/Admin
exports.deleteAnnouncement = asyncHandler(async (req, res) => {
  const { id } = req.params

  const announcement = await db("announcements").where({ id }).first()

  if (!announcement) {
    res.status(404)
    throw new Error("Announcement not found")
  }

  await db("announcements").where({ id }).del()

  res.status(200).json({
    success: true,
    message: "Announcement deleted successfully",
  })
}) 