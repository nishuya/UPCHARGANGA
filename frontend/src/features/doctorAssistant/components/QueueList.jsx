import React, { useCallback } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/StateNotice';
import { useSkipPatient } from '../hooks/useQueueActions';
import { formatQueueTimeRange, getTimingStatusMeta } from '../../../utils/queueTime';

const QueueEntry = React.memo(({ entry, index, onSkip, isSkipping }) => {
  const appointmentId = entry.appointment?._id || entry.appointment;
  const position = entry.queuePosition || index + 2;

  const handleSkip = useCallback(() => {
    onSkip({ appointmentId });
  }, [appointmentId, onSkip]);

  const timingMeta = getTimingStatusMeta(entry);
  const estDisplay = entry.estimatedConsultationStartTime
    ? formatQueueTimeRange(
        entry.estimatedConsultationStartTime,
        entry.estimatedConsultationEndTime
      )
    : formatQueueTimeRange(entry.scheduledStartTime, entry.scheduledEndTime);

  return (
    <div className="flex items-start justify-between gap-lg p-md rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors duration-fast">
      {/* Left: Position, Token, Patient, Estimate */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-neutral-100 border border-neutral-300">
            <span className="text-caption font-bold text-neutral-600">{position}</span>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${timingMeta.badgeClass}`}
          >
            {timingMeta.shortBadge}
          </span>
        </div>

        <p className="text-body font-semibold text-neutral-900 truncate">
          #{entry.tokenNumber} · {entry.patient?.fullName}
        </p>

        <p className="mt-sm text-caption text-neutral-600">
          <span className="font-semibold text-neutral-800">Estimated:</span> {estDisplay}
          {entry.estimatedWaitingMinutes != null && (
            <span>
              {' '}
              · <span className="font-medium">~{entry.estimatedWaitingMinutes} min wait</span>
            </span>
          )}
        </p>
      </div>

      {/* Right: Skip Button */}
      <Button
        size="sm"
        variant="ghost"
        isLoading={isSkipping}
        onClick={handleSkip}
        className="flex-shrink-0"
        title="Skip patient"
      >
        ⊘ Skip
      </Button>
    </div>
  );
});

QueueEntry.displayName = 'QueueEntry';

const QueueList = ({ entries = [] }) => {
  const skipMutation = useSkipPatient();

  const handleSkip = useCallback(
    ({ appointmentId }) => {
      skipMutation.mutate({ appointmentId });
    },
    [skipMutation]
  );

  if (entries.length === 0) {
    return (
      <Card className="border-2 border-dashed border-neutral-300">
        <div className="text-center py-xl">
          <EmptyState
            title="No more patients waiting"
            description="The rest of the queue is empty."
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-lg pb-lg border-b-2 border-neutral-200">
        <h3 className="text-body font-semibold text-neutral-900">Remaining Patients</h3>
        <span className="inline-flex items-center px-md py-sm rounded-full bg-blue-50 border border-blue-200">
          <span className="text-body-sm font-bold text-blue-700">{entries.length}</span>
        </span>
      </div>

      <div className="space-y-md">
        {entries.map((entry, index) => {
          const appointmentId = entry.appointment?._id || entry.appointment;
          return (
            <QueueEntry
              key={appointmentId}
              entry={entry}
              index={index}
              onSkip={handleSkip}
              isSkipping={skipMutation.isPending}
            />
          );
        })}
      </div>
    </Card>
  );
};

export default React.memo(QueueList);
