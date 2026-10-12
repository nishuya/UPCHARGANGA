import { useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import Field from '../../../components/ui/Field';
import { Spinner, EmptyState, ErrorNotice } from '../../../components/ui/StateNotice';
import { useTodaysAppointments } from '../hooks/useTodaysAppointments';
import useReceptionLiveUpdates from '../hooks/useReceptionLiveUpdates';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import StatsBar from '../components/StatsBar';
import StatusFilterTabs from '../components/StatusFilterTabs';
import LiveIndicator from '../components/LiveIndicator';
import ReceptionAppointmentCard from '../components/ReceptionAppointmentCard';

/**
 * Premium UpcharGanga Reception Dashboard
 *
 * Real-time operations dashboard for reception staff.
 * Shows:
 * - Hospital name and context
 * - Today's appointments and queue status
 * - Real-time statistics (waiting, checked-in, in-consultation, etc.)
 * - Filterable appointment list
 * - Live connection indicator
 * - Search by booking number
 *
 * All operations happen here - verify, payment, status updates, queue management.
 */

const ReceptionDashboardPage = () => {
  const { user } = useAuth();
  const hospitalName = user?.hospital?.name || user?.assignedHospital?.name || 'Hospital';
  
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  const filters = useMemo(() => {
    const params = {};
    if (status) params.status = status;
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [status, debouncedSearch]);

  const { data: appointments, isLoading, isError } = useTodaysAppointments(filters);

  const doctorIds = useMemo(
    () => (appointments ?? []).map((a) => a.doctor?._id || a.doctor).filter(Boolean),
    [appointments]
  );
  const { isConnected } = useReceptionLiveUpdates(doctorIds);

  // Calculate key metrics
  const totalAppointments = appointments?.length ?? 0;
  const waitingCount = appointments?.filter((a) => ['pending', 'confirmed'].includes(a.status)).length ?? 0;

  return (
    <div className="space-y-2xl">
      {/* Header: Hospital Context & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-lg">
        <div>
          <h1 className="text-display font-bold text-neutral-900">
            {hospitalName}
          </h1>
          <p className="mt-sm text-body text-neutral-600">
            Reception Dashboard — Today's Appointments
          </p>
        </div>

        {/* Live Indicator */}
        <div className="flex items-center gap-md">
          <LiveIndicator isConnected={isConnected} />
          <div className="text-right">
            <p className="text-caption font-semibold text-neutral-600">
              {totalAppointments} appointment{totalAppointments !== 1 ? 's' : ''} today
            </p>
            {waitingCount > 0 && (
              <p className="text-caption text-blue-600 font-medium">
                {waitingCount} waiting
              </p>
            )}
          </div>
        </div>
      </div>

      {/* KPI Statistics Bar */}
      {!isLoading && !isError && <StatsBar appointments={appointments ?? []} />}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-lg sm:items-end">
        {/* Status Filters */}
        <div className="flex-1">
          <StatusFilterTabs value={status} onChange={setStatus} />
        </div>

        {/* Search Box */}
        <div className="w-full sm:w-80">
          <Field
            label="Search"
            placeholder="Search by booking number…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {/* Appointments List */}
      <div className="space-y-md">
        {/* Loading State */}
        {isLoading && <Spinner label="Loading today's patients…" />}

        {/* Error State */}
        {isError && (
          <ErrorNotice
            message="Couldn't load today's patients right now."
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

        {/* Empty State */}
        {!isLoading && !isError && appointments?.length === 0 && (
          <EmptyState
            title="No appointments match this filter"
            description={
              status || searchInput
                ? 'Try adjusting your filters or search term.'
                : 'No appointments scheduled for today yet.'
            }
          />
        )}

        {/* Appointment Cards */}
        {!isLoading &&
          !isError &&
          appointments?.map((appointment) => (
            <ReceptionAppointmentCard
              key={appointment._id}
              appointment={appointment}
              hospitalName={hospitalName}
            />
          ))}
      </div>
    </div>
  );
};

export default ReceptionDashboardPage;
