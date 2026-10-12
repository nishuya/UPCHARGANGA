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

const TERMINAL_STATUSES = ['completed', 'cancelled', 'no-show'];

const formatTime = (slot) => (slot ? `${slot.start}–${slot.end}` : '—');

/**
 * Premium Reception Appointment Card
 *
 * Professional card for managing appointments at reception.
 * Shows:
 * - Token number (prominent)
 * - Patient name and contact
 * - Doctor and department
 * - Appointment time
 * - Verification and payment status
 * - All available actions for current status
 *
 * One card = one appointment with all reception operations.
 * Uses same component on Today's Patients board and Search results.
 */

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
  const canMarkPending = ['pending', 'confirmed'].includes(appointment.status);
  const canMoveToQueue =
    appointment.status === 'checked-in' && appointment.payment && !appointment.isInDoctorQueue;
  const canManage = !isTerminal;

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
      {/* Main Content: Two Column Layout */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-lg mb-lg">
        {/* Left: Token, Patient, Doctor */}
        <div className="flex-1 min-w-0">
          {/* Token Number - Prominent */}
          <div className="inline-flex items-center gap-sm px-md py-sm rounded-lg bg-gold-50 border border-gold-200 mb-md">
            <span className="text-label font-black text-gold-700">
              Token #{appointment.tokenNumber}
            </span>
          </div>

          {/* Patient */}
          <h3 className="text-h3 font-bold text-neutral-900 truncate">
            {appointment.patient?.fullName}
          </h3>

          {/* Patient Contact */}
          {appointment.patient?.phone && (
            <p className="mt-sm text-body-sm text-neutral-600">
              📞 {appointment.patient.phone}
            </p>
          )}

          {/* Doctor & Department */}
          <div className="mt-md space-y-sm">
            <p className="text-body-sm text-neutral-900">
              <span className="font-semibold">Dr. {appointment.doctor?.user?.fullName}</span>
              {appointment.department?.name && (
                <span className="text-neutral-600"> · {appointment.department.name}</span>
              )}
            </p>

            {/* Booking Reference */}
            <p className="text-caption font-mono text-neutral-600">
              Booking: {appointment.bookingNumber}
            </p>
          </div>
        </div>

        {/* Right: Status & Metadata */}
        <div className="flex flex-col items-end gap-md sm:pt-1">
          {/* Status Badge */}
          <Badge status={appointment.status} />

          {/* Verification Status */}
          <div className="text-right">
            <div className={`text-caption font-semibold ${appointment.verifiedAt ? 'text-success-700' : 'text-warning-700'}`}>
              {appointment.verifiedAt ? '✓ Verified' : '⚠ Not verified'}
            </div>

            {/* Payment Status */}
            <div className={`text-caption font-semibold mt-sm ${appointment.payment ? 'text-success-700' : 'text-danger-700'}`}>
              {appointment.payment ? `✓ Paid ₹${appointment.payment.amount}` : '✗ Payment pending'}
            </div>
          </div>

          {/* Queue Status */}
          {appointment.isInDoctorQueue && (
            <span className="inline-flex items-center gap-xs px-md py-sm rounded-full bg-teal-50 border border-teal-200">
              <span className="text-caption font-semibold text-teal-700">In queue</span>
            </span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-200 my-lg" />

      {/* Time & Location */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-md mb-lg text-sm">
        <div>
          <p className="text-caption font-medium text-neutral-500">Time Slot</p>
          <p className="mt-sm font-semibold text-neutral-900">{formatTime(appointment.timeSlot)}</p>
        </div>
        {hospitalName && (
          <div>
            <p className="text-caption font-medium text-neutral-500">Hospital</p>
            <p className="mt-sm font-semibold text-neutral-900 truncate">{hospitalName}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex flex-wrap gap-md">
          {!appointment.verifiedAt && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpenPanel('verify')}
              className="flex-1 sm:flex-none"
            >
              Verify Patient
            </Button>
          )}
          {!appointment.payment && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpenPanel('payment')}
              className="flex-1 sm:flex-none"
            >
              Collect Payment
            </Button>
          )}
          {canMarkArrived && (
            <Button
              size="sm"
              isLoading={arriveMutation.isPending}
              onClick={() => arriveMutation.mutate({ id: appointment._id })}
              className="flex-1 sm:flex-none"
            >
              Mark Arrived
            </Button>
          )}
          {canMarkPending && (
            <Button
              size="sm"
              variant="secondary"
              isLoading={pendingMutation.isPending}
              onClick={() => pendingMutation.mutate({ id: appointment._id })}
              className="flex-1 sm:flex-none"
            >
              Mark Pending
            </Button>
          )}
          {canMoveToQueue && (
            <Button
              size="sm"
              isLoading={moveMutation.isPending}
              onClick={() => moveMutation.mutate({ id: appointment._id })}
              className="flex-1 sm:flex-none"
            >
              Move to Queue
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpenPanel('no-show')}
            className="flex-1 sm:flex-none"
          >
            Mark No-show
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpenPanel('cancelled')}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Verification Panel */}
      {openPanel === 'verify' && (
        <div className="mt-lg space-y-lg rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
          <div>
            <h4 className="text-body font-semibold text-neutral-900 mb-md">Verify Patient</h4>
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
          <div className="flex gap-md">
            <Button
              size="sm"
              isLoading={verifyMutation.isPending}
              onClick={handleVerify}
            >
              Confirm verification
            </Button>
            <Button size="sm" variant="ghost" onClick={closePanel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Payment Panel */}
      {openPanel === 'payment' && (
        <div className="mt-lg space-y-lg rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
          <div>
            <h4 className="text-body font-semibold text-neutral-900 mb-md">Collect Payment</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-lg">
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
                label={`Amount (optional — defaults to ₹${appointment.doctor?.consultationFee ?? '—'})`}
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
          <div className="flex gap-md">
            <Button
              size="sm"
              isLoading={paymentMutation.isPending}
              onClick={handlePayment}
            >
              Confirm payment
            </Button>
            <Button size="sm" variant="ghost" onClick={closePanel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* No-show / Cancel Panel */}
      {(openPanel === 'no-show' || openPanel === 'cancelled') && (
        <div className="mt-lg space-y-lg rounded-lg border-2 border-danger-200 bg-danger-50 p-lg">
          <div>
            <h4 className="text-body font-semibold text-danger-900 mb-md">
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
          <div className="flex gap-md">
            <Button
              size="sm"
              variant="danger"
              isLoading={statusMutation.isPending}
              onClick={() => handleStatusUpdate(openPanel)}
            >
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={closePanel}>
              Keep appointment
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default ReceptionAppointmentCard;
