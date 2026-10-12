import { useState, useEffect } from 'react';
import { useUnreadNotifications, useMarkNotificationAsRead } from '../hooks/useNotifications';
import { useSocket } from '../../../hooks/useSocket';

/**
 * NotificationBell Component
 * Shows unread notification count and opens a dropdown with recent notifications.
 * Integrates with Socket.IO for real-time updates.
 */
const NotificationBell = () => {
  const { data: unreadNotifications } = useUnreadNotifications(20);
  const markAsReadMutation = useMarkNotificationAsRead();
  const [isOpen, setIsOpen] = useState(false);
  const { socket } = useSocket();

  // Listen for real-time notification events via Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (data) => {
      console.log('📬 [NOTIFY] Received real-time notification:', data);
      // Refresh notifications query
      // The query will auto-refetch due to invalidation
    };

    const handleAppointmentExpired = (data) => {
      console.log('⏰ [NOTIFY] Appointment expired event:', data);
    };

    const handleAppointmentCancelled = (data) => {
      console.log('❌ [NOTIFY] Appointment cancelled event:', data);
    };

    socket.on('appointmentExpired', handleAppointmentExpired);
    socket.on('appointmentCancelled', handleAppointmentCancelled);
    socket.on('newNotification', handleNewNotification);

    return () => {
      socket.off('appointmentExpired', handleAppointmentExpired);
      socket.off('appointmentCancelled', handleAppointmentCancelled);
      socket.off('newNotification', handleNewNotification);
    };
  }, [socket]);

  const handleMarkAsRead = (notificationId) => {
    markAsReadMutation.mutate(notificationId);
  };

  const unreadCount = unreadNotifications?.length || 0;

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-neutral-600 hover:text-upchar-600 transition-colors duration-fast"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        {/* Bell Icon */}
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-danger-600 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-neutral-200 z-50">
          {/* Header */}
          <div className="px-lg py-md border-b border-neutral-200">
            <h3 className="text-sm font-semibold text-neutral-900">Notifications</h3>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {unreadNotifications && unreadNotifications.length > 0 ? (
              unreadNotifications.map((notification) => (
                <div
                  key={notification._id}
                  className="px-lg py-md border-b border-neutral-100 hover:bg-neutral-50 transition-colors duration-fast cursor-pointer"
                  onClick={() => handleMarkAsRead(notification._id)}
                >
                  {/* Title */}
                  <div className="flex items-start justify-between gap-md">
                    <h4 className="text-sm font-semibold text-neutral-900 flex-1">
                      {notification.title}
                    </h4>
                    {!notification.isRead && (
                      <span className="inline-block h-2 w-2 bg-upchar-600 rounded-full flex-shrink-0 mt-1" />
                    )}
                  </div>

                  {/* Message */}
                  <p className="mt-sm text-xs text-neutral-600 line-clamp-2">
                    {notification.message}
                  </p>

                  {/* Timestamp */}
                  <p className="mt-xs text-xs text-neutral-400">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <div className="px-lg py-2xl text-center">
                <p className="text-sm text-neutral-500">No unread notifications</p>
              </div>
            )}
          </div>

          {/* Footer Link */}
          {unreadNotifications && unreadNotifications.length > 0 && (
            <div className="px-lg py-md border-t border-neutral-200 bg-neutral-50">
              <a
                href="/patient/notifications"
                className="text-xs font-semibold text-upchar-600 hover:text-upchar-700"
              >
                View all notifications →
              </a>
            </div>
          )}
        </div>
      )}

      {/* Backdrop - close dropdown when clicking outside */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default NotificationBell;
