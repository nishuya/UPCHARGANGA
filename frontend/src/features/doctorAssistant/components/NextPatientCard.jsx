import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/StateNotice';
import { useCallNextPatient } from '../hooks/useQueueActions';
import { formatQueueTimeRange, getTimingStatusMeta } from '../../../utils/queueTime';

const NextPatientCard = ({ next, hasCurrentPatient, doctorId, date, queueStatus }) => {
  const callMutation = useCallNextPatient();

  const canCall = !!next && !hasCurrentPatient && queueStatus === 'active';

  if (!next) {
    return (
      <Card className="border-2 border-dashed border-neutral-300">
        <div className="text-center py-xl">
          <EmptyState title="Queue is empty" description="No patients waiting right now." />
        </div>
      </Card>
    );
  }

  const timingMeta = getTimingStatusMeta(next);
  const estDisplay = next.estimatedConsultationStartTime
    ? formatQueueTimeRange(
        next.estimatedConsultationStartTime,
        next.estimatedConsultationEndTime
      )
    : formatQueueTimeRange(next.scheduledStartTime, next.scheduledEndTime);

  return (
    <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-neutral-0 hover:shadow-lg transition-all duration-base">
      {/* Header */}
      <div className="mb-lg pb-lg border-b-2 border-blue-200 flex items-start justify-between gap-2">
        <div>
          <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-md">
            Next in Queue
          </p>
          <p className="text-4xl font-black text-blue-600">#{next.tokenNumber}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${timingMeta.badgeClass}`}
        >
          {timingMeta.shortBadge}
        </span>
      </div>

      {/* Patient Information */}
      <div className="space-y-lg mb-lg">
        <div>
          <p className="text-caption font-medium text-neutral-500 mb-sm">Patient Name</p>
          <p className="text-h3 font-bold text-neutral-900 break-words">
            {next.patient?.fullName}
          </p>
        </div>

        {/* Authoritative Estimate */}
        <div className="rounded-lg bg-blue-100/80 border border-blue-300 px-md py-sm space-y-1">
          <p className="text-caption font-semibold text-blue-800">
            Estimated Slot: {estDisplay}
          </p>
          {next.estimatedWaitingMinutes != null && (
            <p className="text-caption text-blue-700">
              ⏱ Estimated wait: ~{next.estimatedWaitingMinutes} minutes
            </p>
          )}
        </div>
      </div>

      {hasCurrentPatient && (
        <div className="mb-lg rounded-lg bg-warning-50 border border-warning-200 px-md py-sm">
          <p className="text-caption font-medium text-warning-700">
            ⚠ Finish with current patient before calling next
          </p>
        </div>
      )}

      {queueStatus === 'paused' && (
        <div className="mb-lg rounded-lg bg-danger-50 border border-danger-200 px-md py-sm">
          <p className="text-caption font-medium text-danger-700">
            🛑 Queue is paused — resume it to call patients
          </p>
        </div>
      )}

      <Button
        size="sm"
        isLoading={callMutation.isPending}
        disabled={!canCall}
        onClick={() => callMutation.mutate({ doctor: doctorId, date })}
        className="w-full"
      >
        📞 Call Next Patient
      </Button>
    </Card>
  );
};

export default NextPatientCard;
