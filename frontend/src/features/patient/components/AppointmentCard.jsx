import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Badge from './ui/PBadge';
import Card from './ui/PCard';
import Button from './ui/PButton';
import { useCancelAppointment } from '../hooks/useAppointments';
import { ROUTES } from '../../../constants/routePaths';

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

const formatTime = (time) => {
  if (!time) return '';
  return time.substring(0, 5);
};

const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'checked-in'];

/**
 * Premium Appointment Card
 *
 * Displays key appointment information with visual hierarchy:
 * - Doctor name (prominent)
 * - Hospital (secondary)
 * - Token number (visually distinctive)
 * - Date and time
 * - Status badge
 * - Quick action link
 * - Cancel button (if cancellable)
 *
 * Memoized to prevent re-renders when parent re-renders with same appointment data.
 */
const AppointmentCard = ({ appointment, onCancelled }) => {
  const cancelMutation = useCancelAppointment();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const canCancel = CANCELLABLE_STATUSES.includes(appointment.status);

  const handleCancel = useCallback(async () => {
    try {
      setCancelError(null);
      console.log('🚫 Cancelling appointment from dashboard:', appointment._id);
      await cancelMutation.mutateAsync({ id: appointment._id, cancellationReason: '' });
      console.log('✅ Appointment cancelled');
      setShowCancelConfirm(false);
      if (onCancelled) onCancelled();
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || 'Failed to cancel appointment';
      console.error('❌ Cancel failed:', err);
      setCancelError(errorMsg);
    }
  }, [appointment._id, cancelMutation, onCancelled]);

  return (
    <Card as="div" className="hover:shadow-lg hover:border-upchar-300 transition-all duration-base">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-lg">
        {/* Left: Doctor and appointment info */}
        <div className="flex-1 min-w-0">
          {/* Doctor name */}
          <h3 className="text-h3 font-bold text-neutral-900 truncate">
            Dr. {appointment.doctor?.user?.fullName}
          </h3>

          {/* Hospital name */}
          <p className="mt-sm text-body-sm font-medium text-neutral-600">
            {appointment.hospital?.name}
          </p>

          {/* Token and date/time */}
          <div className="mt-md flex flex-wrap items-center gap-md">
            {/* Token badge */}
            <div className="inline-flex items-center gap-sm px-md py-sm rounded-lg bg-upchar-50 border border-upchar-200">
              <span className="text-label font-semibold text-upchar-600">
                Token #{appointment.tokenNumber}
              </span>
            </div>

            {/* Date and time */}
            <span className="text-caption text-neutral-500">
              {formatDate(appointment.appointmentDate)}
            </span>
            <span className="text-caption text-neutral-400">·</span>
            <span className="text-caption text-neutral-500">
              {formatTime(appointment.timeSlot?.start)}–{formatTime(appointment.timeSlot?.end)}
            </span>
          </div>

          {/* Booking reference (smaller text) */}
          <p className="mt-md text-caption text-neutral-500">
            Ref: {appointment.bookingNumber}
          </p>
        </div>

        {/* Right: Status badge and action */}
        <div className="flex items-start gap-lg sm:flex-col sm:items-end">
          <Badge status={appointment.status} />
        </div>
      </div>

      {/* Action links and cancel */}
      <div className="mt-lg flex flex-wrap items-center gap-md">
        <Link
          to={`${ROUTES.PATIENT.APPOINTMENT_TRACK}/${appointment._id}`}
          className="inline-flex items-center gap-sm text-body-sm font-semibold text-upchar-600 hover:text-upchar-700 transition-colors duration-fast group"
        >
          Track appointment
          <span className="group-hover:translate-x-sm transition-transform duration-fast">→</span>
        </Link>

        {canCancel && !showCancelConfirm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCancelError(null);
              setShowCancelConfirm(true);
            }}
            className="text-danger-600 hover:text-danger-700"
          >
            Cancel
          </Button>
        )}

        {showCancelConfirm && (
          <div className="flex flex-col gap-md">
            <div className="flex gap-md">
              <Button
                variant="danger"
                size="sm"
                isLoading={cancelMutation.isPending}
                onClick={handleCancel}
              >
                Confirm cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCancelConfirm(false);
                  setCancelError(null);
                }}
              >
                Keep
              </Button>
            </div>
            {cancelError && (
              <p className="text-sm text-danger-600 font-medium">
                ❌ {cancelError}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default React.memo(AppointmentCard);
