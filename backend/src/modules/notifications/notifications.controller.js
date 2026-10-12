const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const notificationService = require('./notifications.service');

const getUnreadNotifications = asyncHandler(async (req, res) => {
  const limit = req.query.limit || 20;
  const notifications = await notificationService.getUnreadNotifications(req.user._id, limit);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { notifications, count: notifications.length },
        'Unread notifications fetched successfully.'
      )
    );
});

const getAllNotifications = asyncHandler(async (req, res) => {
  const limit = req.query.limit || 50;
  const notifications = await notificationService.getAllNotifications(req.user._id, limit);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { notifications, count: notifications.length },
        'All notifications fetched successfully.'
      )
    );
});

const markNotificationAsRead = asyncHandler(async (req, res) => {
  // SECURITY: Pass userId to ensure the requesting user is the notification recipient
  const notification = await notificationService.markAsRead(req.params.id, req.user._id);
  res
    .status(200)
    .json(
      new ApiResponse(200, { notification }, 'Notification marked as read successfully.')
    );
});

module.exports = {
  getUnreadNotifications,
  getAllNotifications,
  markNotificationAsRead,
};
