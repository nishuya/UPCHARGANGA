import { useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import Field from '../../../components/ui/Field';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import { Spinner, EmptyState, ErrorNotice } from '../../../components/ui/StateNotice';
import { useTodaysAppointments } from '../hooks/useTodaysAppointments';
import {
  useMarkArrived,
  useMarkPending,
  useMoveToDoctorQueue,
} from '../hooks/useReceptionActions';
import useReceptionLiveUpdates from '../hooks/useReceptionLiveUpdates';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import StatsBar from '../components/StatsBar';
import StatusFilterTabs from '../components/StatusFilterTabs';
import LiveIndicator from '../components/LiveIndicator';
import ReceptionAppointmentCard from '../components/ReceptionAppointmentCard';
import { formatQueueTimeRange, getTimingStatusMeta } from '../../../utils/queueTime';

/**
 * UpcharGanga Reception Dashboard
 * Displays:
 * - Real-time Queue Overview Table (Token, Patient, Position, Arrival & Appointment Status,
 *   Estimated Consultation Start, Late/Delayed/Ahead Indicator, Duration, Consultation State, Quick Actions)
 * - Detailed Action Cards for verification, payment collection, arrival, pending, and status changes
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
  const arriveMutation = useMarkArrived();
  const pendingMutation = useMarkPending();
  const moveMutation = useMoveToDoctorQueue();

  const doctorIds = useMemo(
    () => (appointments ?? []).map((a) => a.doctor?._id || a.doctor).filter(Boolean),
    [appointments]
  );
  const { isConnected } = useReceptionLiveUpdates(doctorIds);

  const totalAppointments = appointments?.length ?? 0;
  const waitingCount =
    appointments?.filter((a) => ['pending', 'confirmed', 'checked-in'].includes(a.status)).length ??
    0;

  return (
    <div className="space-y-6 sm:space-y-2xl">
      {/* Header: Hospital Context & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-lg">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-display font-bold text-neutral-900 break-words">
            {hospitalName}
          </h1>
          <p className="mt-1 text-body text-neutral-600">
            Reception Dashboard — Today&apos;s Live Queue &amp; Appointments
          </p>
        </div>

        {/* Live Indicator */}
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <LiveIndicator isConnected={isConnected} />
          <div className="text-right">
            <p className="text-caption font-semibold text-neutral-600">
              {totalAppointments} appointment{totalAppointments !== 1 ? 's' : ''} today
            </p>
            {waitingCount > 0 && (
              <p className="text-caption text-blue-600 font-medium">{waitingCount} active</p>
            )}
          </div>
        </div>
      </div>

      {/* KPI Statistics Bar */}
      {!isLoading && !isError && <StatsBar appointments={appointments ?? []} />}

      {/* Filters & Search */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
        <div className="flex-1 min-w-0">
          <StatusFilterTabs value={status} onChange={setStatus} />
        </div>

        <div className="w-full lg:w-80 shrink-0">
          <Field
            label="Search"
            placeholder="Search by booking number…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      {/* Real-Time Queue Summary Table */}
      {!isLoading && !isError && appointments && appointments.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">
              Real-Time Queue Board
            </h2>
            <span className="text-xs text-neutral-500">
              Synchronized live with doctor consultations &amp; patient check-ins
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-xs font-semibold uppercase text-neutral-600">
                <tr>
                  <th className="px-3 py-2.5">Token</th>
                  <th className="px-3 py-2.5">Patient</th>
                  <th className="px-3 py-2.5">Doctor</th>
                  <th className="px-3 py-2.5">Queue Pos</th>
                  <th className="px-3 py-2.5">Status / Arrival</th>
                  <th className="px-3 py-2.5">Estimated Consultation</th>
                  <th className="px-3 py-2.5">Timing Indicator</th>
                  <th className="px-3 py-2.5">Duration</th>
                  <th className="px-3 py-2.5 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {appointments.map((apt) => {
                  const timingMeta = getTimingStatusMeta({
                    timingStatus:
                      apt.status === 'cancelled'
                        ? apt.cancellationReason === 'DOCTOR_UNAVAILABLE'
                          ? 'doctor-unavailable'
                          : 'cancelled'
                        : apt.status === 'completed'
                          ? 'completed'
                          : apt.timingStatus || 'on-time',
                    delayMinutes: apt.delayMinutes,
                    aheadMinutes: apt.aheadMinutes,
                    statusLabel: apt.statusLabel,
                  });

                  const estDisplay = apt.estimatedConsultationStartTime
                    ? formatQueueTimeRange(
                        apt.estimatedConsultationStartTime,
                        apt.estimatedConsultationEndTime
                      )
                    : formatQueueTimeRange(apt.timeSlot?.start, apt.timeSlot?.end);

                  const canArrive = ['pending', 'confirmed'].includes(apt.status);
                  const canPending =
                    ['confirmed', 'checked-in'].includes(apt.status) &&
                    apt.queueEntryStatus !== 'pending';
                  const canRelease =
                    apt.status === 'checked-in' && apt.payment && !apt.isInDoctorQueue;

                  return (
                    <tr key={apt._id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-upchar-700 whitespace-nowrap">
                        #{apt.tokenNumber}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-neutral-900">{apt.patient?.fullName}</p>
                        <p className="text-xs text-neutral-500 font-mono">{apt.bookingNumber}</p>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-700">
                        Dr. {apt.doctor?.user?.fullName}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-neutral-900">
                        {apt.status === 'in-consultation'
                          ? 'In Room'
                          : apt.queuePosition != null && apt.queuePosition > 0
                            ? `#${apt.queuePosition}`
                            : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1 items-start">
                          <Badge status={apt.status} />
                          <span className="text-xs text-neutral-500">
                            {apt.arrivedAt || apt.arrivalStatus === 'arrived-on-time'
                              ? '✓ Checked in'
                              : apt.arrivalStatus === 'arrived-late'
                                ? '✓ Checked in (late)'
                                : 'Not checked in'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-neutral-900 whitespace-nowrap">
                        {estDisplay}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${timingMeta.badgeClass}`}
                        >
                          {timingMeta.badgeText}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600 whitespace-nowrap">
                        {apt.consultationDurationMinutes || 15} min
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {canArrive && (
                            <Button
                              size="sm"
                              onClick={() => arriveMutation.mutate({ id: apt._id })}
                              isLoading={arriveMutation.isPending}
                            >
                              {apt.status === 'pending' ? 'Rejoin / Arrive' : 'Mark Arrived'}
                            </Button>
                          )}
                          {canPending && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => pendingMutation.mutate({ id: apt._id })}
                              isLoading={pendingMutation.isPending}
                            >
                              Mark Pending
                            </Button>
                          )}
                          {canRelease && (
                            <Button
                              size="sm"
                              onClick={() => moveMutation.mutate({ id: apt._id })}
                              isLoading={moveMutation.isPending}
                            >
                              Move to Queue
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Appointments List */}
      <div className="space-y-3 sm:space-y-md">
        {isLoading && <Spinner label="Loading today's patients…" />}

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
