import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Badge from './ui/PBadge';
import Card from './ui/PCard';
import Button from './ui/PButton';
import { useCancelAppointment } from '../hooks/useAppointments';
import { ROUTES } from '../../../constants/routePaths';
import { formatQueueTimeRange, getTimingStatusMeta } from '../../../utils/queueTime';

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'checked-in'];

const AppointmentCard = ({ appointment, onCancelled }) => {
  const cancelMutation = useCancelAppointment();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const canCancel = CANCELLABLE_STATUSES.includes(appointment.status);

  const timingMeta = getTimingStatusMeta({
    timingStatus:
      appointment.status === 'cancelled'
        ? appointment.cancellationReason === 'DOCTOR_UNAVAILABLE'
          ? 'doctor-unavailable'
          : 'cancelled'
        : appointment.status === 'completed'
          ? 'completed'
          : appointment.timingStatus || 'on-time',
    delayMinutes: appointment.delayMinutes,
    aheadMinutes: appointment.aheadMinutes,
    statusLabel: appointment.statusLabel,
    statusMessage: appointment.statusMessage,
    recommendedAction: appointment.recommendedAction,
  });

  const displayTimeRange = appointment.estimatedConsultationStartTime
    ? formatQueueTimeRange(
        appointment.estimatedConsultationStartTime,
        appointment.estimatedConsultationEndTime
      )
    : formatQueueTimeRange(appointment.timeSlot?.start, appointment.timeSlot?.end);

  const handleCancel = useCallback(async () => {
    try {
      setCancelError(null);
      await cancelMutation.mutateAsync({ id: appointment._id, cancellationReason: '' });
      setShowCancelConfirm(false);
      if (onCancelled) onCancelled();
    } catch (err) {
      const errorMsg =
        err?.response?.data?.message || err?.message || 'Failed to cancel appointment';
      setCancelError(errorMsg);
    }
  }, [appointment._id, cancelMutation, onCancelled]);

  return (
    <Card as="div" className="hover:shadow-lg hover:border-upchar-300 transition-all duration-base">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-lg">
        {/* Left: Doctor and appointment info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base sm:text-h3 font-bold text-neutral-900 break-words">
              Dr. {appointment.doctor?.user?.fullName}
            </h3>
            <div className="sm:hidden shrink-0">
              <Badge status={appointment.status} />
            </div>
          </div>

          <p className="mt-1 text-body-sm font-medium text-neutral-600 break-words">
            {appointment.hospital?.name}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-md">
            <div className="inline-flex items-center gap-sm px-2.5 py-1 rounded-lg bg-upchar-50 border border-upchar-200">
              <span className="text-label font-semibold text-upchar-600">
                Token #{appointment.tokenNumber}
              </span>
            </div>

            {appointment.queuePosition != null && appointment.queuePosition > 0 && (
              <div className="inline-flex items-center px-2.5 py-1 rounded-lg bg-neutral-100 border border-neutral-200">
                <span className="text-xs font-semibold text-neutral-700">
                  Queue Pos #{appointment.queuePosition}
                </span>
              </div>
            )}

            <span className="text-caption text-neutral-600 font-medium">
              {formatDate(appointment.appointmentDate)}
            </span>
            <span className="text-caption text-neutral-400">·</span>
            <span className="text-caption font-semibold text-upchar-700">
              Est: {displayTimeRange}
            </span>
          </div>

          {!['completed', 'cancelled', 'no-show'].includes(appointment.status) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${timingMeta.badgeClass}`}
              >
                {timingMeta.badgeText}
              </span>
              {timingMeta.detail && (
                <span className="text-xs text-neutral-600">{timingMeta.detail}</span>
              )}
            </div>
          )}

          <p className="mt-2 text-caption text-neutral-500 break-all">
            Ref: {appointment.bookingNumber}
          </p>
        </div>

        {/* Right: Status badge on sm+ */}
        <div className="hidden sm:flex sm:flex-col sm:items-end gap-2 shrink-0">
          <Badge status={appointment.status} />
        </div>
      </div>

      {/* Action links and cancel */}
      <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`${ROUTES.PATIENT.APPOINTMENT_TRACK}/${appointment._id}`}
          className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-upchar-600 hover:text-upchar-700 transition-colors duration-fast group"
        >
          Track appointment
          <span className="group-hover:translate-x-0.5 transition-transform duration-fast">→</span>
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
          <div className="w-full sm:w-auto flex flex-col gap-2 mt-2 sm:mt-0">
            <div className="flex flex-col xs:flex-row gap-2">
              <Button
                variant="danger"
                size="sm"
                isLoading={cancelMutation.isPending}
                onClick={handleCancel}
                className="w-full xs:w-auto"
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
                className="w-full xs:w-auto"
              >
                Keep
              </Button>
            </div>
            {cancelError && (
              <p className="text-xs sm:text-sm text-danger-600 font-medium">
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
