const fs = require("fs")
const path = require("path")
const { promisify } = require("util")

const mkdirAsync = promisify(fs.mkdir)
const unlinkAsync = promisify(fs.unlink)

const UPLOADS_DIR = path.join(__dirname, "../../uploads")

class StorageService {
  constructor() {
    this.storageType = process.env.STORAGE_TYPE || "local"
    if (this.storageType === "local" && !fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true })
    }
  }

  /**
   * Uploads a file to the configured storage provider.
   * @param {object} file - The file object from multer.
   * @param {string} directory - The subdirectory to upload to (e.g., 'documents', 'avatars').
   * @returns {Promise<{file_key: string, file_location: string}>} - The key and location of the uploaded file.
   */
  async uploadFile(file, directory) {
    return this.uploadToLocal(file, directory)
  }

  /**
   * Uploads a file to the local filesystem.
   * @param {object} file - The file object from multer.
   * @param {string} directory - The subdirectory.
   * @returns {Promise<{file_key: string, file_location: string}>}
   */
  async uploadToLocal(file, directory) {
    const dirPath = path.join(UPLOADS_DIR, directory)
    await mkdirAsync(dirPath, { recursive: true })

    const fileExtension = path.extname(file.originalname)
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${fileExtension}`
    const filePath = path.join(dirPath, fileName)

    fs.writeFileSync(filePath, file.buffer)

    const fileKey = path.join(directory, fileName)
    return {
      file_key: fileKey,
      file_location: `/uploads/${fileKey.replace(/\\/g, "/")}`, // URL-friendly path
    }
  }

  /**
   * Deletes a file from the configured storage.
   * @param {string} key - The key of the file to delete.
   * @returns {Promise<void>}
   */
  async deleteFile(key) {
    return this.deleteFromLocal(key)
  }

  /**
   * Deletes a file from the local filesystem.
   * @param {string} key - The key of the file to delete.
   * @returns {Promise<void>}
   */
  async deleteFromLocal(key) {
    try {
      if (!key) {
        console.warn("deleteFromLocal called with null or undefined key.");
        return;
      }
      const filePath = path.join(UPLOADS_DIR, key)
      if (fs.existsSync(filePath)) {
        await unlinkAsync(filePath)
        console.log(`Local file deleted: ${filePath}`)
      } else {
        console.warn(`Local file not found for deletion: ${filePath}`)
      }
    } catch (error) {
      console.error(`Error deleting local file ${key}:`, error)
      throw new Error("Could not delete file from local storage.")
    }
  }

  /**
   * Gets a temporary signed URL for a file.
   * For local storage, this can just return the static path.
   * @param {string} key - The key of the file.
   * @param {number} expiresIn - The expiration time in seconds (ignored for local).
   * @returns {Promise<string>} - The accessible URL for the file.
   */
  async getSignedUrl(key, expiresIn = 3600) {
    // For local storage, we just return the direct path.
    // In a real production scenario with protected static files, this would need a mechanism
    // to serve the file only to authorized users, perhaps via a dedicated route.
    return `/uploads/${key.replace(/\\/g, "/")}`
  }
}

module.exports = new StorageService()