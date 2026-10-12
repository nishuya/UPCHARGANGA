import { useEffect } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/StateNotice';
import { useStartConsultation, useCompleteConsultation, useSkipPatient } from '../hooks/useQueueActions';

/**
 * Premium Clinical Current Patient Card
 *
 * Shows the patient currently being served or called.
 * Displays:
 * - Token number (prominent)
 * - Patient name and contact
 * - Reason for visit and symptoms
 * - Current status (Called / In Consultation)
 * - Action buttons (Start / Complete / Skip)
 *
 * State machine:
 * called -> Start Consultation -> in-consultation -> Complete Consultation -> done
 */

const CurrentPatientCard = ({ entry }) => {
  const startMutation = useStartConsultation();
  const completeMutation = useCompleteConsultation();
  const skipMutation = useSkipPatient();

  if (!entry) {
    return (
      <Card className="border-2 border-dashed border-neutral-300">
        <div className="text-center py-2xl">
          <EmptyState
            title="No patient called yet"
            description="Call the next patient when ready to begin consultation."
          />
        </div>
      </Card>
    );
  }

  const appointmentId = entry.appointment?._id || entry.appointment;
  // Status can be on entry (queue-specific) or appointment (appointment-specific)
  const entryStatus = entry.status;
  const appointmentStatus = entry.appointment?.status;
  const status = entryStatus || appointmentStatus || '';

  // Debug: Log the actual status value to diagnose
  console.log('🏥 CurrentPatientCard render:', {
    tokenNumber: entry.tokenNumber,
    entryStatus: entryStatus,
    appointmentStatus: appointmentStatus,
    resolvedStatus: status,
    patientName: entry.patient?.fullName,
    appointmentId: appointmentId,
    entrySnapshot: JSON.stringify({
      status: entry.status,
      appointment: entry.appointment?._id,
      tokenNumber: entry.tokenNumber,
    }),
  });

  // Simple logic: if there's a current patient, they're either:
  // 1. Ready to start (not yet in consultation) → Show "Start Consultation"
  // 2. In consultation (already started) → Show "Complete Consultation"
  // 3. Done (completed/no-show/cancelled) → Show nothing (but this shouldn't appear as current)

  const isInConsultation = status === 'in-consultation';
  const isFinished = ['completed', 'no-show', 'cancelled'].includes(status);

  // Show "Start" button for any status that's NOT in-consultation and NOT finished
  const canStart = !isInConsultation && !isFinished;
  // Show "Complete" button ONLY when actively in consultation
  const canComplete = isInConsultation;

  console.log('🎯 Button state:', { canStart, canComplete, status, isInConsultation, isFinished });
  console.log('📊 Mutations state:', {
    startPending: startMutation.isPending,
    completePending: completeMutation.isPending,
    skipPending: skipMutation.isPending,
  });

  return (
    <Card className="border-2 border-teal-300 bg-gradient-to-br from-teal-50 to-neutral-0 hover:shadow-lg transition-all duration-base">
      {/* Token - Prominent Display */}
      <div className="mb-lg pb-lg border-b-2 border-teal-200">
        <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-md">
          Current Token
        </p>
        <p className="text-5xl sm:text-6xl font-black text-teal-600">
          #{entry.tokenNumber}
        </p>
      </div>

      {/* Patient Information */}
      <div className="space-y-lg mb-lg">
        {/* Patient Name */}
        <div>
          <p className="text-caption font-medium uppercase tracking-widest text-neutral-500 mb-sm">
            Patient
          </p>
          <h3 className="text-h2 font-bold text-neutral-900">
            {entry.patient?.fullName}
          </h3>
          {entry.patient?.phone && (
            <p className="mt-md text-body-sm text-neutral-600">
              📞 {entry.patient.phone}
            </p>
          )}
        </div>

        {/* Clinical Info */}
        {entry.appointment?.reasonForVisit && (
          <div>
            <p className="text-caption font-medium uppercase tracking-widest text-neutral-500 mb-sm">
              Reason for Visit
            </p>
            <p className="text-body text-neutral-900">
              {entry.appointment.reasonForVisit}
            </p>
          </div>
        )}

        {entry.appointment?.symptoms?.length > 0 && (
          <div>
            <p className="text-caption font-medium uppercase tracking-widest text-neutral-500 mb-sm">
              Symptoms
            </p>
            <div className="flex flex-wrap gap-md">
              {entry.appointment.symptoms.map((symptom) => (
                <span
                  key={symptom}
                  className="inline-flex items-center px-md py-sm rounded-full bg-teal-100 border border-teal-200 text-body-sm font-medium text-teal-700"
                >
                  {symptom}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status Badge */}
      <div className="mb-lg pb-lg border-t-2 border-teal-200">
        <span className={`inline-flex items-center px-md py-sm rounded-full text-body-sm font-semibold ${
          canStart && !canComplete
            ? 'bg-blue-100 border border-blue-300 text-blue-700'
            : 'bg-teal-100 border border-teal-300 text-teal-700'
        }`}>
          {canStart && !canComplete ? '📢 Ready to Start' : canComplete ? '🏥 In Consultation' : '⏳ Processing'}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-md">
        {/* Debug info */}
        <div className="text-xs text-neutral-500 mb-md w-full bg-neutral-100 p-sm rounded">
          Status: "{status}" | CanStart: {String(canStart)} | CanComplete: {String(canComplete)} | StartLoading: {String(startMutation.isPending)} | CompleteLoading: {String(completeMutation.isPending)}
        </div>

        {/* MUTUALLY EXCLUSIVE BUTTONS */}
        {canStart && !canComplete && (
          <>
            <Button
              size="sm"
              isLoading={startMutation.isPending}
              onClick={() => {
                console.log('🎯 [BUTTON CLICK] START button clicked');
                console.log('  appointmentId:', appointmentId);
                console.log('  canStart:', canStart, 'canComplete:', canComplete);
                console.log('  status:', status);
                console.log('  Calling startMutation.mutate with:', { appointmentId });
                startMutation.mutate({ appointmentId });
                console.log('  Mutation called');
              }}
              className="flex-1"
            >
              ▶ Start Consultation
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isLoading={skipMutation.isPending}
              onClick={() => {
                console.log('⊘ Skipping patient:', appointmentId);
                skipMutation.mutate({ appointmentId });
              }}
              className="flex-1"
            >
              ⊘ Skip
            </Button>
          </>
        )}

        {canComplete && !canStart && (
          <Button
            size="sm"
            isLoading={completeMutation.isPending}
            onClick={() => {
              console.log('✓ Completing consultation for:', appointmentId);
              completeMutation.mutate({ appointmentId });
            }}
            className="flex-1 bg-success-600 hover:bg-success-700 text-white"
          >
            ✓ Complete Consultation
          </Button>
        )}

        {!canStart && !canComplete && (
          <div className="text-center py-lg text-neutral-500">
            <p className="text-sm">Appointment {status}</p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CurrentPatientCard;
