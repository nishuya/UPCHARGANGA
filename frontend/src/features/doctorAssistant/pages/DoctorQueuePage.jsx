import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Spinner, ErrorNotice } from '../../../components/ui/StateNotice';
import { useQueue } from '../hooks/useQueue';
import useQueueLiveUpdates from '../hooks/useQueueLiveUpdates';
import LiveIndicator from '../components/LiveIndicator';
import CurrentPatientCard from '../components/CurrentPatientCard';
import NextPatientCard from '../components/NextPatientCard';
import QueueList from '../components/QueueList';

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Premium UpcharGanga Doctor Assistant Queue Management — Responsive
 */
const DoctorQueuePage = () => {
  const { user } = useAuth();

  const hospitalName = user?.hospital?.name || user?.assignedHospital?.name || 'Hospital';
  const assignedDoctorId = user?.assignedDoctor?._id || user?.assignedDoctor;
  const assignedDoctorName =
    user?.assignedDoctor?.user?.fullName || user?.assignedDoctor?.fullName || 'Dr. —';
  const assignedDoctorSpec = user?.assignedDoctor?.specialization || '—';

  const [date, setDate] = useState(todayISO());

  if (!assignedDoctorId) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-danger-200 bg-danger-50 p-6 sm:p-2xl text-center">
          <h2 className="text-label font-semibold text-danger-900 mb-2">No Assigned Doctor</h2>
          <p className="text-body text-danger-700">
            Your account has not been assigned to a doctor yet. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const { data: queueView, isLoading, isError } = useQueue({ doctor: assignedDoctorId, date });
  const { isConnected } = useQueueLiveUpdates(assignedDoctorId, date);

  const currentPatient = queueView?.currentPatient ?? null;
  const waitingList = queueView?.waitingList ?? [];
  const [next, ...restQueue] = waitingList;

  const totalWaiting = waitingList.length;
  const totalCompleted = queueView?.totalCompleted ?? 0;
  const currentlyServing = currentPatient ? 1 : 0;

  return (
    <div className="space-y-6 sm:space-y-2xl">
      {/* Header: Triple Branding + Live Status */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-lg">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-display font-bold text-neutral-900 break-words">
            Dr. {assignedDoctorName}
          </h1>
          <p className="mt-1 sm:mt-md text-body text-neutral-600 break-words">
            {assignedDoctorSpec} · {hospitalName}
          </p>
        </div>

        <LiveIndicator isConnected={isConnected} />
      </div>

      {/* Queue Controls: Date Selection */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
        <div className="w-full sm:w-80">
          <label className="block text-label font-semibold text-neutral-700 mb-2">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-body focus:border-upchar-600 focus:outline-none"
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
          {/* Clinical Metrics Bar — Responsive 1-col on tiny phones, 3-col on xs/sm+ */}
          <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 sm:gap-md">
            <div className="rounded-lg border border-neutral-200 bg-gradient-to-br from-teal-50 to-teal-0 px-4 py-3 sm:px-lg sm:py-lg">
              <p className="text-2xl sm:text-4xl font-black text-teal-700 mb-1">
                {currentlyServing}
              </p>
              <p className="text-caption sm:text-body-sm font-semibold text-neutral-600">
                Currently Consulting
              </p>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-gradient-to-br from-blue-50 to-blue-0 px-4 py-3 sm:px-lg sm:py-lg">
              <p className="text-2xl sm:text-4xl font-black text-blue-700 mb-1">{totalWaiting}</p>
              <p className="text-caption sm:text-body-sm font-semibold text-neutral-600">Waiting</p>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-gradient-to-br from-success-50 to-success-0 px-4 py-3 sm:px-lg sm:py-lg">
              <p className="text-2xl sm:text-4xl font-black text-success-700 mb-1">
                {totalCompleted}
              </p>
              <p className="text-caption sm:text-body-sm font-semibold text-neutral-600">
                Completed
              </p>
            </div>
          </div>

          {/* Current Patient */}
          <div>
            <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-3 sm:mb-lg">
              Current Patient
            </h2>
            <CurrentPatientCard entry={currentPatient} />
          </div>

          {/* Next Patient & Queue */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-lg">
            <div className="lg:col-span-1">
              <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-3 sm:mb-lg">
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

            <div className="lg:col-span-2">
              <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-3 sm:mb-lg">
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
