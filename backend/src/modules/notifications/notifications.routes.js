const express = require('express');
const router = express.Router();

const notificationController = require('./notifications.controller');
const protect = require('../../middlewares/auth.middleware');
const validateObjectId = require('../../middlewares/validateObjectId.middleware');

// All notification routes require authentication (patient/user)
router.use(protect);

// GET /notifications - Fetch unread notifications for the logged-in user
router.get('/', notificationController.getUnreadNotifications);

// GET /notifications/all - Fetch all notifications (read and unread)
router.get('/all', notificationController.getAllNotifications);

// PATCH /notifications/:id/read - Mark a notification as read
router.patch(
  '/:id/read',
  validateObjectId('id'),
  notificationController.markNotificationAsRead
);

module.exports = router;
