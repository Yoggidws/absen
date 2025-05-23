const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

class StorageService {
  constructor() {
    this.storageType = process.env.STORAGE_TYPE || 'local';
    
    if (this.storageType === 's3') {
      this.s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.S3_REGION
      });
      this.bucket = process.env.S3_BUCKET;
    }
  }

  async uploadFile(file, directory) {
    if (this.storageType === 's3') {
      return this.uploadToS3(file, directory);
    }
    return this.uploadToLocal(file, directory);
  }

  async uploadToS3(file, directory) {
    const key = `${directory}/${Date.now()}-${file.originalname}`;
    
    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'private'
    };

    try {
      const result = await this.s3.upload(params).promise();
      return {
        url: result.Location,
        key: result.Key
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error('Failed to upload file to S3');
    }
  }

  async uploadToLocal(file, directory) {
    const uploadDir = path.join(__dirname, '../../uploads', directory);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${Date.now()}-${file.originalname}`;
    const filepath = path.join(uploadDir, filename);

    try {
      await fs.promises.writeFile(filepath, file.buffer);
      return {
        url: `/uploads/${directory}/${filename}`,
        key: `${directory}/${filename}`
      };
    } catch (error) {
      console.error('Local upload error:', error);
      throw new Error('Failed to upload file locally');
    }
  }

  async deleteFile(key) {
    if (this.storageType === 's3') {
      return this.deleteFromS3(key);
    }
    return this.deleteFromLocal(key);
  }

  async deleteFromS3(key) {
    const params = {
      Bucket: this.bucket,
      Key: key
    };

    try {
      await this.s3.deleteObject(params).promise();
      return true;
    } catch (error) {
      console.error('S3 delete error:', error);
      throw new Error('Failed to delete file from S3');
    }
  }

  async deleteFromLocal(key) {
    const filepath = path.join(__dirname, '../../uploads', key);
    
    try {
      await fs.promises.unlink(filepath);
      return true;
    } catch (error) {
      console.error('Local delete error:', error);
      throw new Error('Failed to delete file locally');
    }
  }

  async getSignedUrl(key, expiresIn = 3600) {
    if (this.storageType !== 's3') {
      return `/uploads/${key}`;
    }

    const params = {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresIn
    };

    try {
      return await this.s3.getSignedUrlPromise('getObject', params);
    } catch (error) {
      console.error('S3 signed URL error:', error);
      throw new Error('Failed to generate signed URL');
    }
  }
}

module.exports = new StorageService(); 