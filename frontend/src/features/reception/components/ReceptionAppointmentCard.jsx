import { useState } from 'react';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Field from '../../../components/ui/Field';
import {
  useVerifyPatient,
  useCollectPayment,
  useMarkArrived,
  useMarkPending,
  useMoveToDoctorQueue,
  useUpdateAppointmentStatus,
} from '../hooks/useReceptionActions';
import { getApiErrorMessage } from '../../../utils/apiError';
import { formatQueueTimeRange, getTimingStatusMeta } from '../../../utils/queueTime';

const TERMINAL_STATUSES = ['completed', 'cancelled', 'no-show'];

const ReceptionAppointmentCard = ({ appointment, hospitalName }) => {
  const [openPanel, setOpenPanel] = useState(null);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [reason, setReason] = useState('');

  const verifyMutation = useVerifyPatient();
  const paymentMutation = useCollectPayment();
  const arriveMutation = useMarkArrived();
  const pendingMutation = useMarkPending();
  const moveMutation = useMoveToDoctorQueue();
  const statusMutation = useUpdateAppointmentStatus();

  const closePanel = () => {
    setOpenPanel(null);
    setNotes('');
    setPaymentMethod('cash');
    setPaymentAmount('');
    setReason('');
  };

  const isTerminal = TERMINAL_STATUSES.includes(appointment.status);
  const canMarkArrived = ['pending', 'confirmed'].includes(appointment.status);
  const canMarkPending =
    ['confirmed', 'checked-in'].includes(appointment.status) &&
    appointment.queueEntryStatus !== 'pending';
  const canMoveToQueue =
    appointment.status === 'checked-in' && appointment.payment && !appointment.isInDoctorQueue;
  const canManage = !isTerminal;

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

  const estimatedDisplay = appointment.estimatedConsultationStartTime
    ? formatQueueTimeRange(
        appointment.estimatedConsultationStartTime,
        appointment.estimatedConsultationEndTime
      )
    : formatQueueTimeRange(appointment.timeSlot?.start, appointment.timeSlot?.end);

  const handleVerify = async () => {
    await verifyMutation.mutateAsync({ id: appointment._id, verificationNotes: notes });
    closePanel();
  };

  const handlePayment = async () => {
    await paymentMutation.mutateAsync({
      id: appointment._id,
      method: paymentMethod,
      amount: paymentAmount ? Number(paymentAmount) : undefined,
    });
    closePanel();
  };

  const handleStatusUpdate = async (status) => {
    await statusMutation.mutateAsync({ id: appointment._id, status, reason });
    closePanel();
  };

  return (
    <Card className="hover:shadow-lg hover:border-upchar-300 transition-all duration-base">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4 sm:mb-lg">
        {/* Left: Token, Queue Position, Patient, Doctor */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-sm px-2.5 py-1 rounded-lg bg-gold-50 border border-gold-200">
                <span className="text-label font-black text-gold-700">
                  Token #{appointment.tokenNumber}
                </span>
              </div>
              {appointment.queuePosition != null && appointment.queuePosition > 0 && (
                <div className="inline-flex items-center px-2.5 py-1 rounded-lg bg-neutral-100 border border-neutral-200">
                  <span className="text-xs font-bold text-neutral-700">
                    Queue Position #{appointment.queuePosition}
                  </span>
                </div>
              )}
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${timingMeta.badgeClass}`}
              >
                {timingMeta.badgeText}
              </span>
            </div>
            <div className="sm:hidden">
              <Badge status={appointment.status} />
            </div>
          </div>

          <h3 className="text-base sm:text-h3 font-bold text-neutral-900 break-words">
            {appointment.patient?.fullName}
          </h3>

          {appointment.patient?.phone && (
            <p className="mt-1 text-body-sm text-neutral-600">📞 {appointment.patient.phone}</p>
          )}

          <div className="mt-2.5 space-y-1">
            <p className="text-body-sm text-neutral-900 break-words">
              <span className="font-semibold">Dr. {appointment.doctor?.user?.fullName}</span>
              {appointment.department?.name && (
                <span className="text-neutral-600"> · {appointment.department.name}</span>
              )}
            </p>

            <p className="text-caption font-mono text-neutral-600 break-all">
              Booking: {appointment.bookingNumber}
            </p>
          </div>
        </div>

        {/* Right: Status & Metadata */}
        <div className="flex flex-row flex-wrap sm:flex-col items-center sm:items-end justify-between gap-2 sm:pt-1 border-t border-neutral-100 pt-3 sm:border-t-0 sm:pt-0">
          <div className="hidden sm:block">
            <Badge status={appointment.status} />
          </div>

          <div className="flex flex-wrap sm:flex-col items-center sm:items-end gap-x-4 gap-y-1 text-left sm:text-right">
            <div
              className={`text-caption font-semibold ${
                appointment.verifiedAt ? 'text-success-700' : 'text-warning-700'
              }`}
            >
              {appointment.verifiedAt ? '✓ Verified' : '⚠ Not verified'}
            </div>

            <div
              className={`text-caption font-semibold ${
                appointment.payment ? 'text-success-700' : 'text-danger-700'
              }`}
            >
              {appointment.payment ? `✓ Paid ₹${appointment.payment.amount}` : '✗ Payment pending'}
            </div>
          </div>

          {appointment.isInDoctorQueue && (
            <span className="inline-flex items-center gap-xs px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200">
              <span className="text-caption font-semibold text-teal-700">In doctor queue</span>
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-neutral-200 my-3 sm:my-lg" />

      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-3 mb-4 sm:mb-lg text-sm">
        <div>
          <p className="text-caption font-medium text-neutral-500">Booked Slot</p>
          <p className="mt-0.5 font-semibold text-neutral-900">
            {formatQueueTimeRange(appointment.timeSlot?.start, appointment.timeSlot?.end)}
          </p>
        </div>
        <div>
          <p className="text-caption font-medium text-neutral-500">Estimated Consultation</p>
          <p className="mt-0.5 font-bold text-upchar-600">{estimatedDisplay}</p>
        </div>
        <div>
          <p className="text-caption font-medium text-neutral-500">Consultation Duration</p>
          <p className="mt-0.5 font-semibold text-neutral-900">
            {appointment.consultationDurationMinutes || 15} min
          </p>
        </div>
        {hospitalName && (
          <div>
            <p className="text-caption font-medium text-neutral-500">Hospital</p>
            <p className="mt-0.5 font-semibold text-neutral-900 break-words">{hospitalName}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {canManage && (
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:flex sm:flex-wrap gap-2">
          {!appointment.verifiedAt && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpenPanel('verify')}
              className="w-full sm:w-auto"
            >
              Verify Patient
            </Button>
          )}
          {!appointment.payment && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpenPanel('payment')}
              className="w-full sm:w-auto"
            >
              Collect Payment
            </Button>
          )}
          {canMarkArrived && (
            <Button
              size="sm"
              isLoading={arriveMutation.isPending}
              onClick={() => arriveMutation.mutate({ id: appointment._id })}
              className="w-full sm:w-auto"
            >
              {appointment.status === 'pending' ? 'Rejoin & Mark Arrived' : 'Mark Arrived'}
            </Button>
          )}
          {canMarkPending && (
            <Button
              size="sm"
              variant="secondary"
              isLoading={pendingMutation.isPending}
              onClick={() => pendingMutation.mutate({ id: appointment._id })}
              className="w-full sm:w-auto"
            >
              Mark Pending
            </Button>
          )}
          {canMoveToQueue && (
            <Button
              size="sm"
              isLoading={moveMutation.isPending}
              onClick={() => moveMutation.mutate({ id: appointment._id })}
              className="w-full sm:w-auto"
            >
              Move to Queue
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpenPanel('no-show')}
            className="w-full sm:w-auto"
          >
            Mark No-show
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpenPanel('cancelled')}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Verification Panel */}
      {openPanel === 'verify' && (
        <div className="mt-4 space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div>
            <h4 className="text-body font-semibold text-neutral-900 mb-2">Verify Patient</h4>
            <Field
              label="Verification notes (optional)"
              as="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., ID confirmed against booking name"
              rows={3}
            />
          </div>
          {verifyMutation.isError && (
            <p className="text-body-sm font-medium text-danger-700">
              {getApiErrorMessage(verifyMutation.error, 'Verification failed.')}
            </p>
          )}
          <div className="flex flex-col xs:flex-row gap-2">
            <Button
              size="sm"
              isLoading={verifyMutation.isPending}
              onClick={handleVerify}
              className="w-full xs:w-auto"
            >
              Confirm verification
            </Button>
            <Button size="sm" variant="ghost" onClick={closePanel} className="w-full xs:w-auto">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Payment Panel */}
      {openPanel === 'payment' && (
        <div className="mt-4 space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div>
            <h4 className="text-body font-semibold text-neutral-900 mb-2">Collect Payment</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Payment method"
                as="select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="netbanking">Net banking</option>
                <option value="wallet">Wallet</option>
              </Field>
              <Field
                label={`Amount (defaults to ₹${appointment.doctor?.consultationFee ?? '—'})`}
                type="number"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={appointment.doctor?.consultationFee}
              />
            </div>
          </div>
          {paymentMutation.isError && (
            <p className="text-body-sm font-medium text-danger-700">
              {getApiErrorMessage(paymentMutation.error, 'Payment failed.')}
            </p>
          )}
          <div className="flex flex-col xs:flex-row gap-2">
            <Button
              size="sm"
              isLoading={paymentMutation.isPending}
              onClick={handlePayment}
              className="w-full xs:w-auto"
            >
              Confirm payment
            </Button>
            <Button size="sm" variant="ghost" onClick={closePanel} className="w-full xs:w-auto">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* No-show / Cancel Panel */}
      {(openPanel === 'no-show' || openPanel === 'cancelled') && (
        <div className="mt-4 space-y-4 rounded-lg border-2 border-danger-200 bg-danger-50 p-4">
          <div>
            <h4 className="text-body font-semibold text-danger-900 mb-2">
              {openPanel === 'no-show' ? 'Mark as No-show' : 'Cancel Appointment'}
            </h4>
            <Field
              label="Reason (optional)"
              as="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this appointment being marked no-show/cancelled?"
              rows={3}
            />
          </div>
          {statusMutation.isError && (
            <p className="text-body-sm font-medium text-danger-700">
              {getApiErrorMessage(statusMutation.error, 'Update failed.')}
            </p>
          )}
          <div className="flex flex-col xs:flex-row gap-2">
            <Button
              size="sm"
              variant="danger"
              isLoading={statusMutation.isPending}
              onClick={() => handleStatusUpdate(openPanel)}
              className="w-full xs:w-auto"
            >
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={closePanel} className="w-full xs:w-auto">
              Keep appointment
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default ReceptionAppointmentCard;
