import { useAllNotifications, useMarkNotificationAsRead } from '../hooks/useNotifications';
import { useSocket } from '../../../hooks/useSocket';
import { useEffect, useState } from 'react';
import { Spinner, ErrorNotice, EmptyState } from '../components/ui/PStateNotice';

/**
 * Patient Notifications/Inbox Page
 * Shows all notifications (read + unread) with filtering and marking as read
 */
const PatientNotificationsPage = () => {
  const { data: allNotifications = [], isLoading } = useAllNotifications(100);
  const markAsReadMutation = useMarkNotificationAsRead();
  const { socket } = useSocket();
  const [filter, setFilter] = useState('all'); // 'all', 'unread', 'read'

  // Listen for real-time notification updates
  useEffect(() => {
    if (!socket) return;

    const handleAppointmentExpired = () => {
      console.log('📬 Appointment expired notification received');
    };

    const handleAppointmentCancelled = () => {
      console.log('📬 Appointment cancelled notification received');
    };

    socket.on('appointmentExpired', handleAppointmentExpired);
    socket.on('appointmentCancelled', handleAppointmentCancelled);

    return () => {
      socket.off('appointmentExpired', handleAppointmentExpired);
      socket.off('appointmentCancelled', handleAppointmentCancelled);
    };
  }, [socket]);

  const handleMarkAsRead = (notificationId) => {
    markAsReadMutation.mutate(notificationId);
  };

  const handleMarkAllAsRead = () => {
    allNotifications
      .filter((n) => !n.isRead)
      .forEach((n) => {
        markAsReadMutation.mutate(n._id);
      });
  };

  // Filter notifications
  const filteredNotifications = allNotifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'read') return n.isRead;
    return true;
  });

  if (isLoading) {
    return <Spinner label="Loading notifications…" />;
  }

  return (
    <div className="space-y-2xl">
      {/* Header */}
      <div>
        <h1 className="text-display font-bold text-neutral-900">Notifications</h1>
        <p className="mt-md text-body text-neutral-600">
          Stay updated with appointment reminders and status changes.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-md border-b border-neutral-200">
        {[
          { value: 'all', label: 'All', count: allNotifications.length },
          {
            value: 'unread',
            label: 'Unread',
            count: allNotifications.filter((n) => !n.isRead).length,
          },
          {
            value: 'read',
            label: 'Read',
            count: allNotifications.filter((n) => n.isRead).length,
          },
        ].map(({ value, label, count }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-lg py-md text-sm font-medium transition-colors duration-fast border-b-2 -mb-px ${
              filter === value
                ? 'border-upchar-600 text-upchar-600'
                : 'border-transparent text-neutral-600 hover:text-upchar-600'
            }`}
          >
            {label} <span className="text-neutral-500">({count})</span>
          </button>
        ))}
      </div>

      {/* Actions Bar */}
      {allNotifications.some((n) => !n.isRead) && (
        <div className="flex justify-between items-center px-lg py-md bg-upchar-50 rounded-lg border border-upchar-200">
          <span className="text-sm text-neutral-600">
            {allNotifications.filter((n) => !n.isRead).length} unread notifications
          </span>
          <button
            onClick={handleMarkAllAsRead}
            className="text-sm font-medium text-upchar-600 hover:text-upchar-700 transition-colors duration-fast"
          >
            Mark all as read
          </button>
        </div>
      )}

      {/* Notifications List */}
      <div className="space-y-md">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map((notification) => (
            <div
              key={notification._id}
              className={`p-lg rounded-lg border transition-all duration-fast ${
                notification.isRead
                  ? 'bg-neutral-0 border-neutral-200'
                  : 'bg-upchar-50 border-upchar-200'
              }`}
            >
              {/* Header with title and unread indicator */}
              <div className="flex items-start justify-between gap-lg">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-neutral-900">
                    {notification.title}
                  </h3>
                  <p className="mt-md text-body text-neutral-700">
                    {notification.message}
                  </p>

                  {/* Related appointment link */}
                  {notification.relatedAppointment && (
                    <div className="mt-md">
                      <a
                        href={`/patient/appointments/${notification.relatedAppointment._id}`}
                        className="text-sm font-medium text-upchar-600 hover:text-upchar-700 transition-colors duration-fast"
                      >
                        View appointment →
                      </a>
                    </div>
                  )}

                  {/* Timestamp and metadata */}
                  <div className="mt-md flex items-center gap-lg text-caption text-neutral-500">
                    <span>
                      {new Date(notification.createdAt).toLocaleString()}
                    </span>
                    <span className="text-upchar-600 capitalize">
                      {notification.type.replace('-', ' ')}
                    </span>
                  </div>
                </div>

                {/* Unread indicator + actions */}
                <div className="flex items-start gap-md flex-shrink-0">
                  {!notification.isRead && (
                    <span className="inline-block h-3 w-3 bg-upchar-600 rounded-full mt-1" />
                  )}
                  {!notification.isRead && (
                    <button
                      onClick={() => handleMarkAsRead(notification._id)}
                      className="px-md py-xs text-xs font-medium text-upchar-600 hover:bg-upchar-100 rounded transition-colors duration-fast"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title={filter === 'unread' ? 'All caught up!' : 'No notifications'}
            description={
              filter === 'unread'
                ? "You don't have any unread notifications."
                : 'Notifications will appear here when something changes.'
            }
          />
        )}
      </div>
    </div>
  );
};

export default PatientNotificationsPage;
