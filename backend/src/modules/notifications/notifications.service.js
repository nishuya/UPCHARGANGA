const Notification = require('./notifications.model');
const { NOTIFICATION_TYPE, NOTIFICATION_CHANNEL, DELIVERY_STATUS } = require('../../constants/enums');
const ApiError = require('../../errors/ApiError');

/**
 * Create and persist a notification for a user.
 * Optionally delivers via multiple channels (currently only IN_APP is implemented).
 *
 * @param {Object} payload
 * @param {ObjectId} payload.recipient - User ID to notify
 * @param {String} payload.type - NOTIFICATION_TYPE enum value
 * @param {String} payload.title - Notification title
 * @param {String} payload.message - Notification message body
 * @param {ObjectId} [payload.relatedAppointment] - Associated appointment ID
 * @param {String} [payload.channel] - NOTIFICATION_CHANNEL (default: IN_APP)
 * @returns {Promise<Notification>}
 */
const createNotification = async (payload) => {
  console.log('📬 [NOTIFY] Creating notification:', {
    recipient: payload.recipient,
    type: payload.type,
    channel: payload.channel || NOTIFICATION_CHANNEL.IN_APP,
  });

  try {
    const notification = await Notification.create({
      recipient: payload.recipient,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      relatedAppointment: payload.relatedAppointment || null,
      channel: payload.channel || NOTIFICATION_CHANNEL.IN_APP,
      deliveryStatus: DELIVERY_STATUS.SENT, // For now, mark as sent immediately (in-app)
      sentAt: new Date(),
    });

    console.log('✅ [NOTIFY] Notification created:', notification._id);
    return notification;
  } catch (err) {
    console.error('❌ [NOTIFY] Failed to create notification:', err.message);
    throw new ApiError(500, 'Failed to create notification');
  }
};

/**
 * Notify a patient that their appointment was cancelled due to doctor unavailability.
 * Includes detailed information: doctor name, date, time, reason, and next steps.
 *
 * @param {ObjectId} patientId - Patient user ID
 * @param {Object} appointmentDetails - {
 *   appointmentId,
 *   doctorName,
 *   appointmentDate (YYYY-MM-DD),
 *   appointmentTime (HH:mm - HH:mm),
 *   reason (Vacation, Conference, etc),
 *   reasonNotes (optional additional notes),
 *   unavailabilityStart,
 *   unavailabilityEnd
 * }
 */
const notifyAppointmentCancelledDueToUnavailability = async (patientId, appointmentDetails) => {
  const {
    doctorName,
    appointmentDate,
    appointmentTime,
    reason = 'Unavailable',
    reasonNotes = '',
    unavailabilityStart,
    unavailabilityEnd,
  } = appointmentDetails;

  // Build detailed message with all information
  const title = `Appointment Cancelled — Dr. ${doctorName} Unavailable`;

  const message = `
Your appointment with Dr. ${doctorName} scheduled for ${appointmentDate} at ${appointmentTime} has been cancelled.

📅 **Reason:** ${reason}${reasonNotes ? ` (${reasonNotes})` : ''}
🔄 **Doctor Unavailable:** ${unavailabilityStart} to ${unavailabilityEnd}

Dr. ${doctorName} is unavailable during this period and will not be available for consultations.

✨ **What to do next:**
Please book another appointment with Dr. ${doctorName} on a different date when the doctor is available.

We apologize for any inconvenience.
  `.trim();

  return createNotification({
    recipient: patientId,
    type: NOTIFICATION_TYPE.APPOINTMENT_CANCELLED,
    title,
    message,
    relatedAppointment: appointmentDetails.appointmentId,
    channel: NOTIFICATION_CHANNEL.IN_APP,
  });
};

/**
 * Notify a patient that their appointment has expired.
 * Handles both cutoff-time expiration and end-of-day expiration.
 *
 * @param {ObjectId} patientId - Patient user ID
 * @param {Object} appointmentDetails - { appointmentId, appointmentDate, reason?, doctorName? }
 * - reason: 'cutoff_passed' (default) or 'not_called_end_of_day'
 */
const notifyAppointmentExpired = async (patientId, appointmentDetails) => {
  const { appointmentId, appointmentDate, reason = 'cutoff_passed', doctorName } = appointmentDetails;

  let message, title;

  if (reason === 'not_called_end_of_day') {
    // End-of-day expiration: patient was never called
    title = 'Appointment Expired — End of Day';
    message = `Your appointment for ${appointmentDate} with Dr. ${doctorName || 'the doctor'} has expired as you were not called during consultation hours. Please book another appointment at your earliest convenience.`;
  } else {
    // Cutoff-time expiration: consultation window passed
    title = 'Appointment Expired';
    message = `Your appointment for ${appointmentDate} has expired because the consultation window ended before you were consulted. Please book another appointment.`;
  }

  return createNotification({
    recipient: patientId,
    type: NOTIFICATION_TYPE.APPOINTMENT_CANCELLED,
    title,
    message,
    relatedAppointment: appointmentId,
    channel: NOTIFICATION_CHANNEL.IN_APP,
  });
};

/**
 * Get unread notifications for a user.
 * SECURITY: Only returns notifications where the authenticated user is the recipient.
 *
 * @param {ObjectId} userId - Authenticated user ID
 * @param {Number} [limit=20] - Number of notifications to fetch
 * @returns {Promise<Array>}
 */
const getUnreadNotifications = async (userId, limit = 20) => {
  console.log('📬 [NOTIFY] Fetching unread notifications for user:', userId);

  try {
    const notifications = await Notification.find({
      recipient: userId,
      isRead: false,
    })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100)) // Cap limit to prevent DoS
      .populate('relatedAppointment', 'bookingNumber tokenNumber appointmentDate');

    console.log('✅ [NOTIFY] Found', notifications.length, 'unread notifications');
    return notifications;
  } catch (err) {
    console.error('❌ [NOTIFY] Failed to fetch notifications:', err.message);
    throw new ApiError(500, 'Failed to fetch notifications');
  }
};

/**
 * Mark a notification as read.
 * SECURITY: Verify that the requesting user is the notification recipient.
 *
 * @param {ObjectId} notificationId - Notification ID
 * @param {ObjectId} userId - Authenticated user ID (must be the recipient)
 * @returns {Promise<Notification>}
 */
const markAsRead = async (notificationId, userId) => {
  console.log('📬 [NOTIFY] Marking notification as read:', notificationId);

  try {
    // SECURITY: Query both by ID and by recipient to ensure ownership
    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: userId,
    });

    if (!notification) {
      throw new ApiError(404, 'Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    console.log('✅ [NOTIFY] Notification marked as read');
    return notification;
  } catch (err) {
    console.error('❌ [NOTIFY] Failed to mark notification as read:', err.message);
    throw err;
  }
};

/**
 * Get all notifications for a user (read and unread).
 * SECURITY: Only returns notifications where the authenticated user is the recipient.
 *
 * @param {ObjectId} userId - Authenticated user ID
 * @param {Number} [limit=50] - Number of notifications to fetch
 * @returns {Promise<Array>}
 */
const getAllNotifications = async (userId, limit = 50) => {
  console.log('📬 [NOTIFY] Fetching all notifications for user:', userId);

  try {
    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200)) // Cap limit to prevent DoS
      .populate('relatedAppointment', 'bookingNumber tokenNumber appointmentDate');

    return notifications;
  } catch (err) {
    console.error('❌ [NOTIFY] Failed to fetch all notifications:', err.message);
    throw new ApiError(500, 'Failed to fetch notifications');
  }
};

module.exports = {
  createNotification,
  notifyAppointmentCancelledDueToUnavailability,
  notifyAppointmentExpired,
  getUnreadNotifications,
  markAsRead,
  getAllNotifications,
};
