import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Spinner, ErrorNotice, EmptyState } from '../../../components/ui/StateNotice';
import { useQueue } from '../hooks/useQueue';
import useQueueLiveUpdates from '../hooks/useQueueLiveUpdates';
import QueueControls from '../components/QueueControls';
import LiveIndicator from '../components/LiveIndicator';
import CurrentPatientCard from '../components/CurrentPatientCard';
import NextPatientCard from '../components/NextPatientCard';
import QueueList from '../components/QueueList';

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Premium UpcharGanga Doctor Assistant Queue Management
 *
 * Professional clinical operations interface for managing live patient queue.
 * Shows:
 * - Hospital and doctor context (triple branding)
 * - Current patient prominently
 * - Next patients queue
 * - Clinical statistics
 * - Queue controls and status
 * - Live Socket.IO updates
 *
 * SECURITY: Doctor assistants can ONLY view their assigned doctor's queue.
 * The doctorId is locked to their assignedDoctor — no dropdown selection available.
 * All operations are restricted to this one assigned doctor.
 */

const DoctorQueuePage = () => {
  const { user } = useAuth();
  console.log('👤 [DOCTOR QUEUE] Auth user:', {
    userId: user?._id,
    role: user?.role,
    assignedDoctor: user?.assignedDoctor,
    assignedDoctorId: user?.assignedDoctor?._id,
    assignedDoctorUserId: user?.assignedDoctor?.user?._id,
    assignedDoctorName: user?.assignedDoctor?.user?.fullName,
    rawUser: JSON.stringify(user, null, 2),
  });

  const hospitalName = user?.hospital?.name || user?.assignedHospital?.name || 'Hospital';

  // SECURITY: Lock to assigned doctor only
  const assignedDoctorId = user?.assignedDoctor?._id || user?.assignedDoctor;
  const assignedDoctorName = user?.assignedDoctor?.user?.fullName || user?.assignedDoctor?.fullName || 'Dr. —';
  const assignedDoctorSpec = user?.assignedDoctor?.specialization || '—';

  const [date, setDate] = useState(todayISO());

  if (!assignedDoctorId) {
    return (
      <div className="space-y-2xl">
        <div className="rounded-lg border border-red-200 bg-red-50 p-2xl text-center">
          <h2 className="text-label font-semibold text-red-900 mb-md">No Assigned Doctor</h2>
          <p className="text-body text-red-700">
            Your account has not been assigned to a doctor yet. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const { data: queueView, isLoading, isError } = useQueue({ doctor: assignedDoctorId, date });
  const { isConnected } = useQueueLiveUpdates(assignedDoctorId, date);

  // Use currentPatient from API response (handles both CALLED and IN_CONSULTATION)
  const currentPatient = queueView?.currentPatient ?? null;
  const waitingList = queueView?.waitingList ?? [];
  const [next, ...restQueue] = waitingList;

  // Clinical metrics
  const totalWaiting = waitingList.length;
  const totalCompleted = queueView?.totalCompleted ?? 0;
  const currentlyServing = currentPatient ? 1 : 0;

  return (
    <div className="space-y-2xl">
      {/* Header: Triple Branding + Live Status */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-lg">
        <div>
          {/* Doctor Context */}
          <h1 className="text-display font-bold text-neutral-900">
            Dr. {assignedDoctorName}
          </h1>
          <p className="mt-md text-body text-neutral-600">
            {assignedDoctorSpec} · {hospitalName}
          </p>
        </div>

        {/* Live Indicator */}
        <LiveIndicator isConnected={isConnected} />
      </div>

      {/* Queue Controls: Date Selection Only (Doctor is locked) */}
      <div className="flex flex-col sm:flex-row gap-lg sm:items-end">
        <div className="w-full sm:w-80">
          <label className="block text-label font-semibold text-neutral-700 mb-sm">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-white px-md py-sm text-body focus:border-upchar-600 focus:outline-none"
          />
        </div>
      </div>

      {isLoading && <Spinner label="Loading queue…" />}

      {isError && (
        <ErrorNotice
          message="Couldn't load the queue right now."
          action={
            <button
              onClick={() => window.location.reload()}
              className="text-sm font-medium text-upchar-600 hover:text-upchar-700 underline"
            >
              Try again
            </button>
          }
        />
      )}

      {!isLoading && !isError && (
        <>
          {/* Clinical Metrics Bar */}
          <div className="grid grid-cols-3 gap-md">
            <div className="rounded-lg border border-neutral-200 bg-gradient-to-br from-teal-50 to-teal-0 px-lg py-md sm:py-lg">
              <p className="text-3xl sm:text-4xl font-black text-teal-700 mb-sm">
                {currentlyServing}
              </p>
              <p className="text-caption sm:text-body-sm font-semibold text-neutral-600">
                Currently Consulting
              </p>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-gradient-to-br from-blue-50 to-blue-0 px-lg py-md sm:py-lg">
              <p className="text-3xl sm:text-4xl font-black text-blue-700 mb-sm">
                {totalWaiting}
              </p>
              <p className="text-caption sm:text-body-sm font-semibold text-neutral-600">
                Waiting
              </p>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-gradient-to-br from-success-50 to-success-0 px-lg py-md sm:py-lg">
              <p className="text-3xl sm:text-4xl font-black text-success-700 mb-sm">
                {totalCompleted}
              </p>
              <p className="text-caption sm:text-body-sm font-semibold text-neutral-600">
                Completed
              </p>
            </div>
          </div>

          {/* Current Patient - Prominent Section */}
          <div>
            <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-lg">
              Current Patient
            </h2>
            <CurrentPatientCard entry={currentPatient} />
          </div>

          {/* Next Patient & Queue */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
            {/* Next Patient - Left/Top */}
            <div className="lg:col-span-1">
              <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-lg">
                Next Patient
              </h2>
              <NextPatientCard
                next={next}
                hasCurrentPatient={!!currentPatient}
                doctorId={assignedDoctorId}
                date={date}
                queueStatus={queueView?.queueStatus}
              />
            </div>

            {/* Rest of Queue - Right/Bottom */}
            <div className="lg:col-span-2">
              <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-lg">
                Waiting Queue ({restQueue.length})
              </h2>
              <QueueList entries={restQueue} totalWaiting={waitingList.length} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DoctorQueuePage;
