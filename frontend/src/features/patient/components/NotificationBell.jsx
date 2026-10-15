import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useUnreadNotifications, useMarkNotificationAsRead } from '../hooks/useNotifications';
import { useSocket } from '../../../hooks/useSocket';
import { ROUTES } from '../../../constants/routePaths';

/**
 * NotificationBell Component
 * Shows unread notification count and opens a responsive dropdown with recent notifications.
 */
const NotificationBell = () => {
  const { data: unreadNotifications } = useUnreadNotifications(20);
  const markAsReadMutation = useMarkNotificationAsRead();
  const [isOpen, setIsOpen] = useState(false);
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = () => {};
    const handleAppointmentExpired = () => {};
    const handleAppointmentCancelled = () => {};

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
        className="relative rounded-md p-2 text-neutral-600 hover:bg-neutral-100 hover:text-upchar-600 transition-colors duration-fast"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-danger-600 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Responsive Dropdown Menu — anchored full-width on mobile, 384px popover on sm+ */}
      {isOpen && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-96 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl shadow-xl border border-neutral-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900">Notifications</h3>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-neutral-500 hover:text-neutral-700 sm:hidden"
            >
              Close
            </button>
          </div>

          <div className="max-h-80 sm:max-h-96 overflow-y-auto">
            {unreadNotifications && unreadNotifications.length > 0 ? (
              unreadNotifications.map((notification) => (
                <div
                  key={notification._id}
                  className="px-4 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition-colors duration-fast cursor-pointer"
                  onClick={() => handleMarkAsRead(notification._id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-neutral-900 flex-1 break-words">
                      {notification.title}
                    </h4>
                    {!notification.isRead && (
                      <span className="inline-block h-2 w-2 bg-upchar-600 rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>

                  <p className="mt-1 text-xs text-neutral-600 line-clamp-2 break-words">
                    {notification.message}
                  </p>

                  <p className="mt-1 text-[11px] text-neutral-400">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-neutral-500">No unread notifications</p>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-neutral-200 bg-neutral-50 text-center sm:text-left">
            <Link
              to={ROUTES.PATIENT.NOTIFICATIONS}
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-upchar-600 hover:text-upchar-700"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}

      {/* Backdrop */}
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
