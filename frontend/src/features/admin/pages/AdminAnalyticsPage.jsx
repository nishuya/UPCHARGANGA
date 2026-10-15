import { useState } from 'react';
import { Spinner, ErrorNotice } from '../../../components/ui/StateNotice';
import { useAnalytics } from '../hooks/useAnalytics';
import DateRangeSelect from '../components/DateRangeSelect';
import AppointmentsTrendChart from '../components/charts/AppointmentsTrendChart';
import RevenueTrendChart from '../components/charts/RevenueTrendChart';
import StatusBreakdownChart from '../components/charts/StatusBreakdownChart';
import VolumeBarChart from '../components/charts/VolumeBarChart';

const AdminAnalyticsPage = () => {
  const [days, setDays] = useState(30);
  const { data: analytics, isLoading, isError } = useAnalytics(days);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Analytics</h1>
          <p className="mt-1 text-sm sm:text-base text-ink-muted">Trends across bookings, revenue, and patient growth.</p>
        </div>
        <DateRangeSelect value={days} onChange={setDays} />
      </div>

      {isLoading && <Spinner label="Crunching the numbers…" />}
      {isError && <ErrorNotice message="Couldn't load analytics right now." />}

      {analytics && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 min-w-0">
              <AppointmentsTrendChart
                data={analytics.appointmentsPerDay}
                subtitle={`Last ${analytics.range.days} days`}
              />
            </div>
            <div className="min-w-0">
              <StatusBreakdownChart
                data={analytics.appointmentsByStatus}
                subtitle={`Last ${analytics.range.days} days`}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <RevenueTrendChart
                data={analytics.revenuePerDay}
                subtitle={`Last ${analytics.range.days} days, successful payments`}
              />
            </div>
            <div className="min-w-0">
              <AppointmentsTrendChart
                data={analytics.newPatientsPerDay}
                title="New Patients"
                subtitle={`Last ${analytics.range.days} days`}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <VolumeBarChart
                data={analytics.appointmentsByHospital.map((h) => ({ name: h.name, count: h.count }))}
                title="Top Hospitals by Volume"
                subtitle={`Last ${analytics.range.days} days`}
                barColor="#33449E"
              />
            </div>
            <div className="min-w-0">
              <VolumeBarChart
                data={analytics.appointmentsByDepartment.map((d) => ({ name: d.name, count: d.count }))}
                title="Top Departments by Volume"
                subtitle={`Last ${analytics.range.days} days`}
                barColor="#B5560F"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAnalyticsPage;
