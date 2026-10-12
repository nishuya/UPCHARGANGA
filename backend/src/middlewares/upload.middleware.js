const multer = require('multer');
const config = require('../config/env');

/**
 * Magic number signatures for supported image formats.
 * Used to validate actual file content, not just MIME type.
 */
const MAGIC_NUMBERS = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF header; WebP is RIFF-based
};

/**
 * Verify that the file buffer starts with the expected magic numbers for a given format.
 */
const validateMagicNumber = (buffer, mimeType) => {
  if (!buffer || buffer.length === 0) return false;

  let expected;
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      expected = MAGIC_NUMBERS.jpeg;
      break;
    case 'image/png':
      expected = MAGIC_NUMBERS.png;
      break;
    case 'image/webp':
      expected = MAGIC_NUMBERS.webp;
      break;
    default:
      return false;
  }

  // Check if buffer starts with expected bytes
  for (let i = 0; i < expected.length; i++) {
    if (buffer[i] !== expected[i]) return false;
  }
  return true;
};

/**
 * Multer Memory Storage for Image Uploads
 * Stores files in memory (as buffer) so they can be uploaded directly to Cloudinary
 * without writing to disk first.
 */
const storage = multer.memoryStorage();

/**
 * File filter - validate file types at the middleware level.
 * SECURITY: Check both MIME type AND file signature (magic numbers).
 */
const fileFilter = (req, file, cb) => {
  // Check MIME type
  if (!config.upload.allowedImageTypes.includes(file.mimetype)) {
    return cb(new Error(`Invalid file type: ${file.mimetype}`), false);
  }

  // We'll validate magic numbers in the main handler after multer processes the file
  cb(null, true);
};

/**
 * Enhanced file validation after multer has processed the file.
 * Validates magic numbers and checks for suspicious content.
 */
const validateFileSignature = (req, res, next) => {
  if (!req.file) {
    return next(); // No file uploaded, let downstream handle it
  }

  // SECURITY: Validate file signature (magic numbers) against declared MIME type
  if (!validateMagicNumber(req.file.buffer, req.file.mimetype)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file content. File signature does not match declared type.',
    });
  }

  // SECURITY: Check for suspicious file sizes (empty files or unusually small for images)
  if (req.file.buffer.length < 100) {
    return res.status(400).json({
      success: false,
      message: 'File is too small to be a valid image.',
    });
  }

  next();
};

/**
 * Error handler for multer
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size: ${config.upload.maxFileSize}MB`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files uploaded',
      });
    }
  }
  if (err && err.message) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next(err);
};

/**
 * Single file upload middleware
 * @param {String} fieldName - Form field name for the file
 */
const uploadSingle = (fieldName = 'image') => {
  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: config.upload.maxFileSize * 1024 * 1024, // Convert MB to bytes
    },
  }).single(fieldName);
};

/**
 * Multiple files upload middleware
 * @param {String} fieldName - Form field name for the files
 * @param {Number} maxCount - Maximum number of files
 */
const uploadMultiple = (fieldName = 'images', maxCount = 5) => {
  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: config.upload.maxFileSize * 1024 * 1024,
      files: maxCount,
    },
  }).array(fieldName, maxCount);
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  handleMulterError,
  validateFileSignature,
};
