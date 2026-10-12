const cloudinary = require('cloudinary').v2;
const config = require('../config/env');
const ApiError = require('../errors/ApiError');

/**
 * Cloudinary Image Upload Service
 * Handles secure image uploads, deletions, and URL management for cities, hospitals, and doctors.
 */

// Initialize Cloudinary if credentials are available
if (config.cloudinary.enabled) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });
  console.log('✅ [CLOUDINARY] Initialized with cloud_name:', config.cloudinary.cloudName);
} else {
  console.warn('⚠️  [CLOUDINARY] Credentials not configured. Image uploads will be disabled.');
}

/**
 * Validate image file before upload
 * @param {Object} file - Express multer file object
 * @throws {ApiError} If validation fails
 */
const validateImageFile = (file) => {
  if (!file) {
    throw new ApiError(400, 'No file provided.');
  }

  // Check file type
  if (!config.upload.allowedImageTypes.includes(file.mimetype)) {
    throw new ApiError(
      400,
      `Invalid file type. Allowed types: ${config.upload.allowedImageTypes.join(', ')}`
    );
  }

  // Check file size (convert bytes to MB)
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > config.upload.maxFileSize) {
    throw new ApiError(
      400,
      `File size exceeds limit of ${config.upload.maxFileSize}MB. Your file is ${fileSizeMB.toFixed(2)}MB.`
    );
  }
};

/**
 * Upload image to Cloudinary
 * @param {Object} file - Express multer file object
 * @param {String} folder - Cloudinary folder path (e.g., 'upcharganaga/cities')
 * @param {String} publicId - Optional custom public ID
 * @returns {Promise<Object>} { url, publicId }
 */
const uploadImage = async (file, folder, publicId = null) => {
  if (!config.cloudinary.enabled) {
    throw new ApiError(503, 'Image upload service is not configured. Please set Cloudinary credentials.');
  }

  try {
    validateImageFile(file);

    console.log('📤 [CLOUDINARY] Uploading image to folder:', folder);

    const uploadOptions = {
      folder,
      resource_type: 'auto',
      quality: 'auto',
      fetch_format: 'auto',
    };

    // Use custom public ID if provided (for replacements)
    if (publicId) {
      uploadOptions.public_id = publicId;
      uploadOptions.overwrite = true;
    }

    // Upload from buffer (Express multer provides file.buffer)
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
      uploadStream.end(file.buffer);
    });

    console.log('✅ [CLOUDINARY] Upload successful:', result.public_id);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
    };
  } catch (err) {
    console.error('❌ [CLOUDINARY] Upload failed:', err.message);
    throw new ApiError(500, `Image upload failed: ${err.message}`);
  }
};

/**
 * Delete image from Cloudinary
 * @param {String} publicId - Cloudinary public ID
 * @returns {Promise<Boolean>} true if deleted, false if not found
 */
const deleteImage = async (publicId) => {
  if (!config.cloudinary.enabled) {
    console.warn('⚠️  [CLOUDINARY] Image deletion skipped - service not configured');
    return true; // Don't fail if service is disabled
  }

  if (!publicId) {
    return false;
  }

  try {
    console.log('🗑️  [CLOUDINARY] Deleting image:', publicId);

    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result === 'ok') {
      console.log('✅ [CLOUDINARY] Deletion successful:', publicId);
      return true;
    } else if (result.result === 'not found') {
      console.warn('⚠️  [CLOUDINARY] Image not found:', publicId);
      return false;
    }
  } catch (err) {
    console.error('❌ [CLOUDINARY] Deletion failed:', err.message);
    // Don't throw - allow the operation to continue even if deletion fails
    return false;
  }
};

/**
 * Replace an existing image with a new one
 * @param {Object} file - Express multer file object (new image)
 * @param {String} oldPublicId - Public ID of image to replace
 * @param {String} folder - Cloudinary folder path
 * @returns {Promise<Object>} { url, publicId }
 */
const replaceImage = async (file, oldPublicId, folder) => {
  if (!config.cloudinary.enabled) {
    throw new ApiError(503, 'Image upload service is not configured.');
  }

  try {
    validateImageFile(file);

    // Extract filename from public ID to keep consistency
    const filename = oldPublicId ? oldPublicId.split('/').pop() : null;
    const newPublicId = filename ? `${folder}/${filename}` : null;

    console.log('🔄 [CLOUDINARY] Replacing image:', oldPublicId, '→', newPublicId);

    // Upload new image with same public ID (overwrites)
    const result = await uploadImage(file, folder, newPublicId);

    console.log('✅ [CLOUDINARY] Replacement successful');
    return result;
  } catch (err) {
    console.error('❌ [CLOUDINARY] Replacement failed:', err.message);
    throw err;
  }
};

module.exports = {
  uploadImage,
  deleteImage,
  replaceImage,
  validateImageFile,
  isConfigured: () => config.cloudinary.enabled,
};
