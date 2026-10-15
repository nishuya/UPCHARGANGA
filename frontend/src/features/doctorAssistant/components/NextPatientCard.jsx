import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/StateNotice';
import { useCallNextPatient } from '../hooks/useQueueActions';

/**
 * Premium Clinical Next Patient Card
 *
 * Shows the next patient in queue ready to be called.
 * Displays:
 * - Token number
 * - Patient name
 * - Estimated waiting time
 * - Call button (enabled only when appropriate)
 *
 * Call is disabled if:
 * - No current patient finished (hasCurrentPatient = true)
 * - Queue is paused (queueStatus != 'active')
 */

const NextPatientCard = ({ next, hasCurrentPatient, doctorId, date, queueStatus }) => {
  const callMutation = useCallNextPatient();

  const canCall = !!next && !hasCurrentPatient && queueStatus === 'active';

  if (!next) {
    return (
      <Card className="border-2 border-dashed border-neutral-300">
        <div className="text-center py-xl">
          <EmptyState
            title="Queue is empty"
            description="No patients waiting right now."
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-neutral-0 hover:shadow-lg transition-all duration-base">
      {/* Header */}
      <div className="mb-lg pb-lg border-b-2 border-blue-200">
        <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-md">
          Next in Queue
        </p>
        <p className="text-4xl font-black text-blue-600">
          #{next.tokenNumber}
        </p>
      </div>

      {/* Patient Information */}
      <div className="space-y-lg mb-lg">
        {/* Patient Name */}
        <div>
          <p className="text-caption font-medium text-neutral-500 mb-sm">
            Patient Name
          </p>
          <p className="text-h3 font-bold text-neutral-900">
            {next.patient?.fullName}
          </p>
        </div>

        {/* Wait Time Estimate */}
        {next.estimatedWaitingMinutes != null && (
          <div className="rounded-lg bg-blue-100 border border-blue-300 px-md py-sm">
            <p className="text-caption font-medium text-blue-700">
              ⏱ Estimated wait: ~{next.estimatedWaitingMinutes} minutes
            </p>
          </div>
        )}
      </div>

      {/* Status Messages */}
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

      {/* Call Button */}
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
