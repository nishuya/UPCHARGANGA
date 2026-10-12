import { useState } from 'react';
import Field from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import { usePauseQueue, useResumeQueue, useSetAverageConsultationMinutes } from '../hooks/useQueueActions';

const QUEUE_STATUS_LABELS = { active: 'Active', paused: 'Paused', closed: 'Closed' };
const QUEUE_STATUS_STYLES = {
  active: 'bg-success-50 border-success-200 text-success-700',
  paused: 'bg-warning-50 border-warning-200 text-warning-700',
  closed: 'bg-neutral-50 border-neutral-200 text-neutral-600',
};

/**
 * Premium Clinical Queue Controls
 *
 * Professional interface for queue management:
 * - Doctor selection dropdown
 * - Date picker
 * - Queue status badge
 * - Pause/Resume toggle
 * - Average consultation time editor
 *
 * All operations affect the queue as a whole, not individual patients.
 */

const QueueStatusPill = ({ status }) => (
  <span
    className={`inline-flex items-center gap-sm rounded-full px-md py-sm text-body-sm font-semibold border-2 ${
      QUEUE_STATUS_STYLES[status] || 'bg-neutral-50 border-neutral-200 text-neutral-600'
    }`}
  >
    <span className={`w-2.5 h-2.5 rounded-full ${
      status === 'active' ? 'bg-success-500' :
      status === 'paused' ? 'bg-warning-500' :
      'bg-neutral-400'
    }`} />
    {QUEUE_STATUS_LABELS[status] || status}
  </span>
);

const QueueControls = ({
  doctors,
  doctorId,
  onDoctorChange,
  date,
  onDateChange,
  queueStatus,
  averageConsultationMinutes,
}) => {
  const [avgInput, setAvgInput] = useState('');
  const pauseMutation = usePauseQueue();
  const resumeMutation = useResumeQueue();
  const avgMutation = useSetAverageConsultationMinutes();

  const handlePauseToggle = () => {
    if (queueStatus === 'paused') {
      resumeMutation.mutate({ doctor: doctorId, date });
    } else {
      pauseMutation.mutate({ doctor: doctorId, date });
    }
  };

  const handleAvgSubmit = (e) => {
    e.preventDefault();
    const minutes = Number(avgInput);
    if (!minutes || minutes < 1) return;
    avgMutation.mutate(
      { doctor: doctorId, date, averageConsultationMinutes: minutes },
      { onSuccess: () => setAvgInput('') }
    );
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-gradient-to-r from-neutral-0 to-neutral-50 p-lg space-y-lg">
      {/* Section 1: Doctor & Date Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-lg">
        <Field
          label="Doctor"
          as="select"
          value={doctorId}
          onChange={onDoctorChange}
        >
          <option value="">Select a doctor</option>
          {doctors?.map((doctor) => (
            <option key={doctor._id} value={doctor._id}>
              Dr. {doctor.user?.fullName} — {doctor.specialization}
            </option>
          ))}
        </Field>

        <Field
          label="Date"
          type="date"
          value={date}
          onChange={onDateChange}
        />
      </div>

      {/* Section 2: Queue Status & Controls */}
      {doctorId && (
        <div className="border-t-2 border-neutral-200 pt-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-lg">
            {/* Left: Status & Pause Button */}
            <div className="flex items-center gap-lg">
              <div>
                <p className="text-caption font-medium text-neutral-500 mb-sm">Queue Status</p>
                <QueueStatusPill status={queueStatus} />
              </div>

              <Button
                size="sm"
                variant="secondary"
                isLoading={pauseMutation.isPending || resumeMutation.isPending}
                disabled={queueStatus === 'closed'}
                onClick={handlePauseToggle}
              >
                {queueStatus === 'paused' ? '▶ Resume' : '⏸ Pause'}
              </Button>
            </div>
          </div>

          {/* Section 3: Average Consultation Time */}
          <div className="mt-lg pt-lg border-t-2 border-neutral-200">
            <form onSubmit={handleAvgSubmit} className="flex flex-col sm:flex-row sm:items-end gap-lg">
              <Field
                label={`Average consultation time${averageConsultationMinutes ? ` (currently ${averageConsultationMinutes} min)` : ''}`}
                type="number"
                min="1"
                max="180"
                placeholder="Minutes"
                value={avgInput}
                onChange={(e) => setAvgInput(e.target.value)}
                className="sm:flex-1"
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                isLoading={avgMutation.isPending}
                disabled={!avgInput}
              >
                Update
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueueControls;
