const axios = require("axios");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// Validasi bahwa semua variabel lingkungan yang wajib telah diatur
const requiredEnvVars = ['B2_APPLICATION_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_ID'];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`FATAL: Variabel lingkungan untuk Backblaze B2 tidak ditemukan: ${varName}. Mohon periksa file .env Anda.`);
  }
}

class StorageService {
  constructor() {
    this.authToken = null;
    this.apiUrl = null;
    this.downloadUrl = null;
    this.bucketId = process.env.B2_BUCKET_ID;
  }

  async authorize() {
    try {
      const authString = Buffer.from(`${process.env.B2_APPLICATION_KEY_ID}:${process.env.B2_APPLICATION_KEY}`).toString('base64');
      const response = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
        headers: { 'Authorization': `Basic ${authString}` }
      });

      this.authToken = response.data.authorizationToken;
      this.apiUrl = response.data.apiUrl;
      this.downloadUrl = response.data.downloadUrl;
      return true;
    } catch (error) {
      console.error('Error authorizing with B2:', error.message);
      throw new Error(`Gagal mengotorisasi dengan B2: ${error.message}`);
    }
  }

  async getUploadUrl() {
    try {
      if (!this.authToken || !this.apiUrl) {
        await this.authorize();
      }

      const response = await axios.post(`${this.apiUrl}/b2api/v2/b2_get_upload_url`, 
        { bucketId: this.bucketId },
        { headers: { 'Authorization': this.authToken } }
      );

      return {
        uploadUrl: response.data.uploadUrl,
        uploadAuthToken: response.data.authorizationToken
      };
    } catch (error) {
      console.error('Error getting upload URL:', error.message);
      throw new Error(`Gagal mendapatkan URL upload: ${error.message}`);
    }
  }

  async uploadFile(file, directory) {
    try {
      if (!file || !file.buffer) {
        throw new Error('Objek file tidak valid. Buffer file dibutuhkan.');
      }

      // Membuat nama file yang unik dan aman
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const sanitizedFilename = path.basename(file.originalname, fileExtension)
        .replace(/[^a-zA-Z0-9-]/g, '')
        .toLowerCase();
      
      const uniqueKey = `${directory}/${sanitizedFilename}-${uuidv4()}${fileExtension}`;

      // Get upload URL and auth token
      const { uploadUrl, uploadAuthToken } = await this.getUploadUrl();

      // Calculate SHA1 hash of file content
      const sha1 = require('crypto').createHash('sha1').update(file.buffer).digest('hex');

      // Upload file to B2
      const response = await axios.post(uploadUrl, file.buffer, {
        headers: {
          'Authorization': uploadAuthToken,
          'X-Bz-File-Name': uniqueKey,
          'Content-Type': file.mimetype,
          'Content-Length': file.buffer.length,
          'X-Bz-Content-Sha1': sha1,
          'X-Bz-Info-Author': 'unknown'
        }
      });

      console.log(`File berhasil diunggah ke ${response.data.fileName}`);
      return response.data.fileName;

    } catch (error) {
      console.error('Error saat mengunggah file ke Backblaze B2:', error);
      throw new Error(`Gagal mengunggah file: ${error.message}`);
    }
  }

  async deleteFile(key) {
    try {
      if (!key) {
        console.warn("Percobaan menghapus file dengan key null atau undefined.");
        return;
      }

      if (!this.authToken || !this.apiUrl) {
        await this.authorize();
      }

      // First, get the file ID
      const response = await axios.post(`${this.apiUrl}/b2api/v2/b2_list_file_names`, 
        {
          bucketId: this.bucketId,
          startFileName: key,
          maxFileCount: 1
        },
        { headers: { 'Authorization': this.authToken } }
      );

      if (response.data.files.length === 0) {
        throw new Error('File tidak ditemukan');
      }

      const fileId = response.data.files[0].fileId;

      // Delete the file using the file ID
      await axios.post(`${this.apiUrl}/b2api/v2/b2_delete_file_version`,
        {
          fileName: key,
          fileId: fileId
        },
        { headers: { 'Authorization': this.authToken } }
      );

      console.log(`File berhasil dihapus: ${key}`);

    } catch (error) {
      console.error(`Error saat menghapus file ${key} dari Backblaze B2:`, error);
      throw new Error(`Gagal menghapus file: ${error.message}`);
    }
  }

  async getSignedUrl(key, expiresIn = 3600) {
    try {
      if (!key) {
        throw new Error('Key file dibutuhkan untuk membuat signed URL.');
      }

      if (!this.authToken || !this.downloadUrl) {
        await this.authorize();
      }

      // Get download authorization
      const response = await axios.post(`${this.apiUrl}/b2api/v2/b2_get_download_authorization`,
        {
          bucketId: this.bucketId,
          fileNamePrefix: key,
          validDurationInSeconds: expiresIn
        },
        { headers: { 'Authorization': this.authToken } }
      );

      // Construct the download URL
      const downloadUrl = `${this.downloadUrl}/file/${process.env.B2_BUCKET_NAME}/${key}?Authorization=${response.data.authorizationToken}`;
      
      return downloadUrl;

    } catch (error) {
      console.error(`Error saat membuat signed URL untuk ${key}:`, error);
      throw new Error(`Gagal membuat URL unduhan: ${error.message}`);
    }
  }
}

module.exports = new StorageService();