const express = require('express');
const router = express.Router();

const authController = require('./auth.controller');
const validate = require('../../middlewares/validate.middleware');
const protect = require('../../middlewares/auth.middleware');
const optionalAuth = require('../../middlewares/optionalAuth.middleware');
const { authLimiter } = require('../../middlewares/rateLimiter.middleware');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
} = require('./auth.validation');

// Public routes
router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh-token', authController.refreshToken);

// Logout uses optionalAuth so it succeeds and revokes the session/cookie
// even if the short-lived access token has already expired or been cleared.
router.post('/logout', optionalAuth, authController.logout);

// Protected routes (require a valid access token)
router.get('/me', protect, authController.getMe);
router.patch('/profile', protect, validate(updateProfileSchema), authController.updateProfile);

module.exports = router;
