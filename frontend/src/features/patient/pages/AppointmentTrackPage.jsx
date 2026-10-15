import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PBadge from '../components/ui/PBadge';
import Button from '../components/ui/PButton';
import Card from '../components/ui/PCard';
import { Spinner, ErrorNotice } from '../components/ui/PStateNotice';
import { useAppointment, useCancelAppointment } from '../hooks/useAppointments';
import useAppointmentTracking from '../hooks/useAppointmentTracking';
import { ROUTES } from '../../../constants/routePaths';
import {
  formatQueueTime,
  formatQueueTimeRange,
  getTimingStatusMeta,
} from '../../../utils/queueTime';

const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'checked-in'];

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

/**
 * UpcharGanga Patient Live Appointment Tracking Page
 * Displays:
 * 1. Permanent token number & booking reference
 * 2. Current active queue position
 * 3. Authoritative estimated consultation start/end time & recommended arrival time
 * 4. On-time, Doctor running late (+X min), Ahead of schedule (-X min), or Arrival overdue status
 * 5. Clear next action for the patient
 */
const AppointmentTrackPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: appointment, isLoading, isError } = useAppointment(id);
  const live = useAppointmentTracking(id);
  const cancelMutation = useCancelAppointment();
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);

  if (isLoading) return <Spinner label="Loading appointment…" />;
  if (isError || !appointment) {
    return (
      <ErrorNotice
        message="Couldn't load this appointment."
        action={
          <Link
            to={ROUTES.PATIENT.APPOINTMENTS}
            className="text-sm font-medium text-upchar-600 hover:text-upchar-700"
          >
            Back to My Appointments →
          </Link>
        }
      />
    );
  }

  // Merge live Socket.IO / queue-entry state over the REST appointment snapshot
  const effectiveStatus =
    live?.appointmentStatus ||
    (live?.status === 'in-consultation'
      ? 'in-consultation'
      : live?.status === 'completed'
        ? 'completed'
        : appointment.status);
  const canCancel = CANCELLABLE_STATUSES.includes(effectiveStatus);

  const estimatedStart =
    live?.estimatedConsultationStartTime ?? appointment.estimatedConsultationStartTime;
  const estimatedEnd =
    live?.estimatedConsultationEndTime ?? appointment.estimatedConsultationEndTime;
  const recommendedArrival =
    live?.recommendedArrivalTime ?? appointment.recommendedArrivalTime;
  const queuePosition =
    live?.queuePosition !== undefined ? live.queuePosition : appointment.queuePosition;
  const currentlyServingToken = live?.currentlyServingToken ?? 0;

  const timingData = {
    timingStatus:
      effectiveStatus === 'cancelled'
        ? appointment.cancellationReason === 'DOCTOR_UNAVAILABLE'
          ? 'doctor-unavailable'
          : 'cancelled'
        : effectiveStatus === 'completed'
          ? 'completed'
          : live?.timingStatus || appointment.timingStatus || 'on-time',
    delayMinutes: live?.delayMinutes ?? appointment.delayMinutes ?? 0,
    aheadMinutes: live?.aheadMinutes ?? appointment.aheadMinutes ?? 0,
    statusLabel: live?.statusLabel || appointment.statusLabel,
    statusMessage: live?.statusMessage || appointment.statusMessage,
    recommendedAction: live?.recommendedAction || appointment.recommendedAction,
  };
  const timingMeta = getTimingStatusMeta(timingData);

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({ id, cancellationReason: cancelReason });
      navigate(ROUTES.PATIENT.APPOINTMENTS);
    } catch (err) {
      console.error('Cancellation failed:', err);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Back Link */}
      <Link
        to={ROUTES.PATIENT.APPOINTMENTS}
        className="text-sm font-medium text-neutral-600 hover:text-upchar-600 transition-colors duration-fast mb-4 inline-block"
      >
        ← Back to My Appointments
      </Link>

      {/* Header */}
      <div className="mt-2 flex flex-col xs:flex-row xs:items-start xs:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-h1 font-bold text-neutral-900 break-words">
            Dr. {appointment.doctor?.user?.fullName}
          </h1>
          <p className="mt-1 text-body-sm text-neutral-600 break-words">
            {appointment.hospital?.name}
            {appointment.department?.name ? ` · ${appointment.department.name}` : ''}
          </p>
          {appointment.hospital?.address?.line1 && (
            <p className="text-caption text-neutral-500 break-words">
              {appointment.hospital.address.line1}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <PBadge status={live?.called ? 'in-consultation' : effectiveStatus} />
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${timingMeta.badgeClass}`}
          >
            {timingMeta.badgeText}
          </span>
        </div>
      </div>

      {/* Token & Authoritative Estimate Banner */}
      <div className="mt-6 sm:mt-2xl flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-4 sm:gap-xl rounded-2xl border border-upchar-200 bg-upchar-50/60 p-4 sm:px-2xl sm:py-xl">
        <div>
          <p className="text-label font-medium uppercase tracking-widest text-neutral-500">
            Your token
          </p>
          <p className="font-display text-4xl sm:text-5xl font-bold text-upchar-600 mt-1 sm:mt-md">
            #{appointment.tokenNumber}
          </p>
        </div>

        {/* Estimated Consultation Time */}
        {estimatedStart ? (
          <div className="border-t border-upchar-200 pt-3 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-xl">
            <p className="text-caption text-neutral-600">Estimated consultation</p>
            <p className="text-base sm:text-lg font-bold text-upchar-600 mt-1">
              {formatQueueTimeRange(estimatedStart, estimatedEnd)}
            </p>
            {recommendedArrival &&
              !['completed', 'cancelled', 'no-show'].includes(effectiveStatus) && (
                <p className="text-xs font-medium text-neutral-600 mt-1">
                  Please arrive by {formatQueueTime(recommendedArrival)}
                </p>
              )}
          </div>
        ) : appointment.timeSlot ? (
          <div className="border-t border-upchar-200 pt-3 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-xl">
            <p className="text-caption text-neutral-600">Booked time slot</p>
            <p className="text-base sm:text-lg font-bold text-upchar-600 mt-1">
              {formatQueueTimeRange(appointment.timeSlot.start, appointment.timeSlot.end)}
            </p>
          </div>
        ) : null}

        {/* Active Queue Position */}
        {queuePosition != null && queuePosition > 0 && (
          <div className="border-t border-upchar-200 pt-3 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-xl">
            <p className="text-caption text-neutral-600">Position in queue</p>
            <p className="text-xl sm:text-2xl font-bold text-neutral-900 mt-1">
              #{queuePosition}
            </p>
            {currentlyServingToken > 0 && (
              <p className="text-xs text-neutral-500 mt-0.5">
                Now serving #{currentlyServingToken}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Live Queue Timing & Action Guidance Banner */}
      <div className={`mt-4 sm:mt-xl rounded-xl border p-4 ${timingMeta.bannerClass}`}>
        <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2">
          <p className="text-sm sm:text-base font-bold">{timingMeta.headline}</p>
          {timingData.delayMinutes > 0 && (
            <span className="text-xs font-semibold uppercase tracking-wider">
              Estimated delay: {timingData.delayMinutes} min
            </span>
          )}
          {timingData.aheadMinutes > 0 && (
            <span className="text-xs font-semibold uppercase tracking-wider">
              Ahead by ~{timingData.aheadMinutes} min
            </span>
          )}
        </div>
        {timingMeta.detail && (
          <p className="mt-1.5 text-xs sm:text-sm opacity-90">{timingMeta.detail}</p>
        )}
      </div>

      {/* Details Card */}
      <Card className="mt-4 sm:mt-xl">
        <dl className="space-y-4">
          <div className="flex flex-col xs:flex-row xs:justify-between xs:items-start gap-1">
            <dt className="text-body-sm text-neutral-600">Booking reference</dt>
            <dd className="text-body font-semibold text-neutral-900 font-mono break-all">
              {appointment.bookingNumber}
            </dd>
          </div>
          <div className="border-t border-neutral-100 pt-4 flex flex-col xs:flex-row xs:justify-between xs:items-start gap-1">
            <dt className="text-body-sm text-neutral-600">Date</dt>
            <dd className="text-body font-semibold text-neutral-900">
              {formatDate(appointment.appointmentDate)}
            </dd>
          </div>
          <div className="border-t border-neutral-100 pt-4 flex flex-col xs:flex-row xs:justify-between xs:items-start gap-1">
            <dt className="text-body-sm text-neutral-600">Initial booked slot</dt>
            <dd className="text-body font-semibold text-neutral-900">
              {formatQueueTimeRange(appointment.timeSlot?.start, appointment.timeSlot?.end)}
            </dd>
          </div>
          {estimatedStart && (
            <div className="border-t border-neutral-100 pt-4 flex flex-col xs:flex-row xs:justify-between xs:items-start gap-1">
              <dt className="text-body-sm text-neutral-600">Current estimated consultation</dt>
              <dd className="text-body font-semibold text-upchar-600">
                {formatQueueTimeRange(estimatedStart, estimatedEnd)}
              </dd>
            </div>
          )}
          {live?.lastUpdatedAt && (
            <div className="border-t border-neutral-100 pt-4 flex flex-col xs:flex-row xs:justify-between xs:items-start gap-1">
              <dt className="text-body-sm text-neutral-600">Queue state last updated</dt>
              <dd className="text-xs font-medium text-neutral-500">
                {formatQueueTime(live.lastUpdatedAt)}
              </dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Cancellation Reason */}
      {effectiveStatus === 'cancelled' && appointment.cancellationReason && (
        <p className="mt-4 text-body-sm text-neutral-600 break-words">
          Cancellation reason: {appointment.cancellationReason}
        </p>
      )}

      {/* Cancel Appointment */}
      {canCancel && (
        <div className="mt-6">
          {!showCancelForm ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCancelForm(true)}
              className="text-danger-600 hover:text-danger-700"
            >
              Cancel appointment
            </Button>
          ) : (
            <Card className="p-4 sm:p-lg border-warning-200 bg-warning-50/40">
              <p className="text-body font-semibold text-neutral-900 mb-3">
                Are you sure you want to cancel?
              </p>
              <textarea
                className="w-full rounded-md border border-warning-200 p-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-warning-500 focus:outline-none focus:shadow-focus-ring"
                placeholder="Reason (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
              <div className="mt-3 flex flex-col xs:flex-row gap-2.5">
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={cancelMutation.isPending}
                  onClick={handleCancel}
                  className="w-full xs:w-auto"
                >
                  Confirm cancellation
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCancelForm(false)}
                  className="w-full xs:w-auto"
                >
                  Keep appointment
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default AppointmentTrackPage;
