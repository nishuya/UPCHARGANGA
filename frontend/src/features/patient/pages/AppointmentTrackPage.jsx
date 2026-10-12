import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PBadge from '../components/ui/PBadge';
import Button from '../components/ui/PButton';
import Card from '../components/ui/PCard';
import { Spinner, ErrorNotice } from '../components/ui/PStateNotice';
import { useAppointment, useCancelAppointment } from '../hooks/useAppointments';
import useAppointmentTracking from '../hooks/useAppointmentTracking';
import { ROUTES } from '../../../constants/routePaths';

const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'checked-in'];

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const formatTime = (value) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

/**
 * Premium UpcharGanga Appointment Tracking Page
 *
 * Live queue tracking with:
 * - Real-time position updates
 * - Prominent token display
 * - Live estimated wait time
 * - Cancel option for pending appointments
 * - Notification when called
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

  const canCancel = CANCELLABLE_STATUSES.includes(appointment.status);

  const handleCancel = async () => {
    try {
      console.log('🚫 Cancelling appointment:', id);
      await cancelMutation.mutateAsync({ id, cancellationReason: cancelReason });
      console.log('✅ Appointment cancelled successfully');
      navigate(ROUTES.PATIENT.APPOINTMENTS);
    } catch (err) {
      console.error('❌ Cancellation failed:', err);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Back Link */}
      <Link
        to={ROUTES.PATIENT.APPOINTMENTS}
        className="text-sm font-medium text-neutral-600 hover:text-upchar-600 transition-colors duration-fast mb-lg inline-block"
      >
        ← Back to My Appointments
      </Link>

      {/* Header */}
      <div className="mt-lg flex items-start justify-between gap-lg">
        <div>
          <h1 className="text-h1 font-bold text-neutral-900">
            Dr. {appointment.doctor?.user?.fullName}
          </h1>
          <p className="mt-sm text-body-sm text-neutral-600">{appointment.hospital?.name}</p>
          {appointment.hospital?.address?.line1 && (
            <p className="text-caption text-neutral-500">{appointment.hospital.address.line1}</p>
          )}
        </div>
        <PBadge status={live?.called ? 'in-consultation' : appointment.status} />
      </div>

      {/* Token Display - Signature Element */}
      <div className="mt-2xl flex flex-wrap items-center gap-xl rounded-2xl border border-upchar-200 bg-upchar-50/60 px-2xl py-xl">
        <div>
          <p className="text-label font-medium uppercase tracking-widest text-neutral-500">
            Your token
          </p>
          <p className="font-display text-5xl font-bold text-upchar-600 mt-md">
            #{appointment.tokenNumber}
          </p>
        </div>

        {/* Estimated Consultation Time - Primary Display */}
        {live?.estimatedConsultationStartTime != null && live?.estimatedConsultationEndTime != null ? (
          <div className="border-l border-upchar-200 pl-xl">
            <p className="text-caption text-neutral-600">Estimated consultation time</p>
            <p className="text-lg font-bold text-upchar-600 mt-sm">
              {formatTime(live.estimatedConsultationStartTime)} – {formatTime(live.estimatedConsultationEndTime)}
            </p>
          </div>
        ) : appointment.timeSlot ? (
          <div className="border-l border-upchar-200 pl-xl">
            <p className="text-caption text-neutral-600">Booked time slot</p>
            <p className="text-lg font-bold text-upchar-600 mt-sm">
              {appointment.timeSlot.start} – {appointment.timeSlot.end}
            </p>
          </div>
        ) : null}

        {/* Queue Position (Informational Only) */}
        {live?.queuePosition != null && (
          <div className="border-l border-upchar-200 pl-xl">
            <p className="text-caption text-neutral-600">Position in queue</p>
            <p className="text-2xl font-bold text-neutral-900 mt-sm">
              {live.queuePosition}
            </p>
          </div>
        )}
      </div>

      {/* Called Alert */}
      {live?.called && (
        <div className="mt-xl rounded-lg border border-success-200 bg-success-50 px-lg py-md">
          <p className="text-base font-semibold text-success-700">
            ✓ You're being called — please proceed to the consultation room now.
          </p>
        </div>
      )}

      {/* Details Card */}
      <Card className="mt-xl">
        <dl className="space-y-lg">
          <div className="flex justify-between items-start">
            <dt className="text-body-sm text-neutral-600">Booking reference</dt>
            <dd className="text-body font-semibold text-neutral-900">{appointment.bookingNumber}</dd>
          </div>
          <div className="border-t border-neutral-100 pt-lg flex justify-between items-start">
            <dt className="text-body-sm text-neutral-600">Date</dt>
            <dd className="text-body font-semibold text-neutral-900">{formatDate(appointment.appointmentDate)}</dd>
          </div>
          <div className="flex justify-between items-start">
            <dt className="text-body-sm text-neutral-600">Time slot</dt>
            <dd className="text-body font-semibold text-neutral-900">
              {appointment.timeSlot?.start}–{appointment.timeSlot?.end}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Cancellation Reason */}
      {appointment.status === 'cancelled' && appointment.cancellationReason && (
        <p className="mt-xl text-body-sm text-neutral-600">
          Cancellation reason: {appointment.cancellationReason}
        </p>
      )}

      {/* Cancel Appointment */}
      {canCancel && (
        <div className="mt-xl">
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
            <Card variant="warning" className="p-lg">
              <p className="text-body font-semibold text-neutral-900 mb-lg">
                Are you sure you want to cancel?
              </p>
              <textarea
                className="w-full rounded-md border border-warning-200 p-md text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-warning-500 focus:outline-none focus:shadow-focus-ring"
                placeholder="Reason (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <div className="mt-lg flex gap-md">
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={cancelMutation.isPending}
                  onClick={handleCancel}
                >
                  Confirm cancellation
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCancelForm(false)}
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
