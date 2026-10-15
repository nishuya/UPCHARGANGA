import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllNotifications, useMarkNotificationAsRead } from '../hooks/useNotifications';
import { useSocket } from '../../../hooks/useSocket';
import { Spinner, EmptyState } from '../components/ui/PStateNotice';
import { ROUTES } from '../../../constants/routePaths';

/**
 * Patient Notifications/Inbox Page — Responsive
 */
const PatientNotificationsPage = () => {
  const { data: allNotifications = [], isLoading } = useAllNotifications(100);
  const markAsReadMutation = useMarkNotificationAsRead();
  const { socket } = useSocket();
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!socket) return;

    const handleAppointmentExpired = () => {};
    const handleAppointmentCancelled = () => {};

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

  const filteredNotifications = allNotifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'read') return n.isRead;
    return true;
  });

  if (isLoading) {
    return <Spinner label="Loading notifications…" />;
  }

  return (
    <div className="space-y-6 sm:space-y-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-display font-bold text-neutral-900">Notifications</h1>
        <p className="mt-1.5 sm:mt-md text-body text-neutral-600">
          Stay updated with appointment reminders and status changes.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 sm:gap-md border-b border-neutral-200 overflow-x-auto no-scrollbar">
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
            className={`shrink-0 px-3 sm:px-lg py-2.5 sm:py-md text-sm font-medium transition-colors duration-fast border-b-2 -mb-px ${
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
        <div className="flex flex-col xs:flex-row xs:justify-between xs:items-center gap-2 px-4 py-3 bg-upchar-50 rounded-lg border border-upchar-200">
          <span className="text-sm text-neutral-600">
            {allNotifications.filter((n) => !n.isRead).length} unread notifications
          </span>
          <button
            onClick={handleMarkAllAsRead}
            className="self-start xs:self-auto text-sm font-semibold text-upchar-600 hover:text-upchar-700 transition-colors duration-fast"
          >
            Mark all as read
          </button>
        </div>
      )}

      {/* Notifications List */}
      <div className="space-y-3 sm:space-y-md">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map((notification) => (
            <div
              key={notification._id}
              className={`p-4 sm:p-lg rounded-lg border transition-all duration-fast ${
                notification.isRead
                  ? 'bg-neutral-0 border-neutral-200'
                  : 'bg-upchar-50 border-upchar-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-neutral-900 break-words">
                      {notification.title}
                    </h3>
                    {!notification.isRead && (
                      <span className="inline-block h-2.5 w-2.5 bg-upchar-600 rounded-full mt-1.5 shrink-0 sm:hidden" />
                    )}
                  </div>
                  <p className="mt-1.5 text-body text-neutral-700 break-words">
                    {notification.message}
                  </p>

                  {notification.relatedAppointment && (
                    <div className="mt-2.5">
                      <Link
                        to={`${ROUTES.PATIENT.APPOINTMENT_TRACK}/${
                          notification.relatedAppointment._id || notification.relatedAppointment
                        }`}
                        className="text-sm font-medium text-upchar-600 hover:text-upchar-700 transition-colors duration-fast"
                      >
                        View appointment →
                      </Link>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-neutral-500">
                    <span>{new Date(notification.createdAt).toLocaleString()}</span>
                    {notification.type && (
                      <span className="text-upchar-600 capitalize">
                        {notification.type.replace('-', ' ')}
                      </span>
                    )}
                  </div>
                </div>

                {!notification.isRead && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="hidden sm:inline-block h-2.5 w-2.5 bg-upchar-600 rounded-full" />
                    <button
                      onClick={() => handleMarkAsRead(notification._id)}
                      className="px-2.5 py-1 text-xs font-semibold text-upchar-700 bg-upchar-100/70 hover:bg-upchar-100 rounded transition-colors duration-fast"
                    >
                      Mark as read
                    </button>
                  </div>
                )}
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
