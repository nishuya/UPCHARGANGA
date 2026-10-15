import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/StateNotice';
import {
  useStartConsultation,
  useCompleteConsultation,
  useSkipPatient,
} from '../hooks/useQueueActions';

/**
 * Premium Clinical Current Patient Card — Responsive
 */
const CurrentPatientCard = ({ entry }) => {
  const startMutation = useStartConsultation();
  const completeMutation = useCompleteConsultation();
  const skipMutation = useSkipPatient();

  if (!entry) {
    return (
      <Card className="border-2 border-dashed border-neutral-300">
        <div className="text-center py-8 sm:py-2xl">
          <EmptyState
            title="No patient called yet"
            description="Call the next patient when ready to begin consultation."
          />
        </div>
      </Card>
    );
  }

  const appointmentId = entry.appointment?._id || entry.appointment;
  const entryStatus = entry.status;
  const appointmentStatus = entry.appointment?.status;
  const status = entryStatus || appointmentStatus || '';

  const isInConsultation = status === 'in-consultation';
  const isFinished = ['completed', 'no-show', 'cancelled'].includes(status);

  const canStart = !isInConsultation && !isFinished;
  const canComplete = isInConsultation;

  return (
    <Card className="border-2 border-teal-300 bg-gradient-to-br from-teal-50 to-neutral-0 hover:shadow-lg transition-all duration-base">
      {/* Token - Prominent Display */}
      <div className="mb-4 sm:mb-lg pb-4 sm:pb-lg border-b-2 border-teal-200">
        <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-2">
          Current Token
        </p>
        <p className="text-4xl sm:text-6xl font-black text-teal-600">#{entry.tokenNumber}</p>
      </div>

      {/* Patient Information */}
      <div className="space-y-4 sm:space-y-lg mb-4 sm:mb-lg">
        <div>
          <p className="text-caption font-medium uppercase tracking-widest text-neutral-500 mb-1">
            Patient
          </p>
          <h3 className="text-xl sm:text-h2 font-bold text-neutral-900 break-words">
            {entry.patient?.fullName}
          </h3>
          {entry.patient?.phone && (
            <p className="mt-1.5 text-body-sm text-neutral-600">📞 {entry.patient.phone}</p>
          )}
        </div>

        {entry.appointment?.reasonForVisit && (
          <div>
            <p className="text-caption font-medium uppercase tracking-widest text-neutral-500 mb-1">
              Reason for Visit
            </p>
            <p className="text-body text-neutral-900 break-words">
              {entry.appointment.reasonForVisit}
            </p>
          </div>
        )}

        {entry.appointment?.symptoms?.length > 0 && (
          <div>
            <p className="text-caption font-medium uppercase tracking-widest text-neutral-500 mb-1.5">
              Symptoms
            </p>
            <div className="flex flex-wrap gap-2">
              {entry.appointment.symptoms.map((symptom) => (
                <span
                  key={symptom}
                  className="inline-flex items-center px-3 py-1 rounded-full bg-teal-100 border border-teal-200 text-body-sm font-medium text-teal-700"
                >
                  {symptom}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status Badge */}
      <div className="mb-4 sm:mb-lg pt-4 sm:pt-lg border-t-2 border-teal-200">
        <span
          className={`inline-flex items-center px-3 py-1.5 rounded-full text-body-sm font-semibold ${
            canStart && !canComplete
              ? 'bg-blue-100 border border-blue-300 text-blue-700'
              : 'bg-teal-100 border border-teal-300 text-teal-700'
          }`}
        >
          {canStart && !canComplete
            ? '📢 Ready to Start'
            : canComplete
              ? '🏥 In Consultation'
              : '⏳ Processing'}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        {canStart && !canComplete && (
          <>
            <Button
              size="md"
              isLoading={startMutation.isPending}
              onClick={() => startMutation.mutate({ appointmentId })}
              className="w-full sm:flex-1"
            >
              ▶ Start Consultation
            </Button>
            <Button
              size="md"
              variant="ghost"
              isLoading={skipMutation.isPending}
              onClick={() => skipMutation.mutate({ appointmentId })}
              className="w-full sm:flex-1"
            >
              ⊘ Skip
            </Button>
          </>
        )}

        {canComplete && !canStart && (
          <Button
            size="md"
            isLoading={completeMutation.isPending}
            onClick={() => completeMutation.mutate({ appointmentId })}
            className="w-full sm:flex-1 bg-success-600 hover:bg-success-700 text-white"
          >
            ✓ Complete Consultation
          </Button>
        )}

        {!canStart && !canComplete && (
          <div className="text-center py-3 text-neutral-500 w-full">
            <p className="text-sm">Appointment {status}</p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CurrentPatientCard;
