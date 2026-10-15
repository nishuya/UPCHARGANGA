import React, { useCallback } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/StateNotice';
import { useSkipPatient } from '../hooks/useQueueActions';

const formatEta = (value) =>
  value ? new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Premium Clinical Queue List
 *
 * Shows all remaining patients waiting (excluding current and next).
 * Dense but scannable format for clinical operations:
 * - Token and patient name
 * - Queue position
 * - Estimated reporting time and wait duration
 * - Skip action per patient
 *
 * Optimized with memoized entry components to prevent unnecessary re-renders.
 */

// Memoized individual queue entry component
const QueueEntry = React.memo(({
  entry,
  index,
  onSkip,
  isSkipping
}) => {
  const appointmentId = entry.appointment?._id || entry.appointment;
  const position = index + 3; // +3 because we skip current and next

  const handleSkip = useCallback(() => {
    onSkip({ appointmentId });
  }, [appointmentId, onSkip]);

  return (
    <div
      className="flex items-start justify-between gap-lg p-md rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors duration-fast"
    >
      {/* Left: Position, Token, Patient */}
      <div className="flex-1 min-w-0">
        {/* Position Badge */}
        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-neutral-100 border border-neutral-300 mb-md">
          <span className="text-caption font-bold text-neutral-600">
            {position}
          </span>
        </div>

        {/* Patient Info */}
        <p className="text-body font-semibold text-neutral-900 truncate">
          #{entry.tokenNumber} · {entry.patient?.fullName}
        </p>

        {/* ETA and Wait Info */}
        <p className="mt-sm text-caption text-neutral-600">
          <span className="font-medium">ETA:</span> {formatEta(entry.estimatedReportingTime)}
          {entry.estimatedWaitingMinutes != null && (
            <span>
              {' '}· <span className="font-medium">~{entry.estimatedWaitingMinutes} min</span>
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
      >
        ⊘
      </Button>
    </div>
  );
});

QueueEntry.displayName = 'QueueEntry';

const QueueList = ({ entries = [], totalWaiting }) => {
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
      {/* Header with Count */}
      <div className="flex items-center justify-between mb-lg pb-lg border-b-2 border-neutral-200">
        <h3 className="text-body font-semibold text-neutral-900">
          Remaining Patients
        </h3>
        <span className="inline-flex items-center px-md py-sm rounded-full bg-blue-50 border border-blue-200">
          <span className="text-body-sm font-bold text-blue-700">{entries.length}</span>
        </span>
      </div>

      {/* Queue Entries */}
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
