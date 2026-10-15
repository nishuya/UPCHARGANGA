import { Spinner, ErrorNotice } from '../../../components/ui/StateNotice';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import { useAnalytics } from '../hooks/useAnalytics';
import AppointmentsTrendChart from '../components/charts/AppointmentsTrendChart';
import StatusBreakdownChart from '../components/charts/StatusBreakdownChart';
import RevenueTrendChart from '../components/charts/RevenueTrendChart';

const formatCurrency = (value) => `₹${(value ?? 0).toLocaleString('en-IN')}`;

/**
 * Premium KPI Card for Admin Dashboard
 * Displays platform-wide metrics with professional styling
 */
const AdminKPICard = ({ icon, label, value, trend = null, subtitle = null, className = '' }) => {
  const isPositive = typeof trend === 'number' && trend > 0;
  const isNegative = typeof trend === 'number' && trend < 0;

  return (
    <div
      className={`rounded-lg border-2 bg-gradient-to-br p-4 sm:px-lg sm:py-lg transition-all duration-fast hover:shadow-md min-w-0 ${className}`}
    >
      {/* Icon or label indicator */}
      <div className="flex items-start justify-between mb-2 sm:mb-md">
        <div className="text-xl sm:text-2xl">{icon}</div>
        {trend !== null && (
          <span
            className={`inline-flex items-center gap-xs text-xs font-semibold ${
              isPositive ? 'text-success-600' : isNegative ? 'text-danger-600' : 'text-neutral-500'
            }`}
          >
            {isPositive && '↑'}
            {isNegative && '↓'}
            {Math.abs(trend)}%
          </span>
        )}
      </div>

      {/* Value - Large and prominent */}
      <p className="text-2xl sm:text-3xl xl:text-4xl font-black text-neutral-900 mb-xs break-words">{value}</p>

      {/* Label */}
      <p className="text-xs sm:text-sm font-semibold text-neutral-600">{label}</p>

      {/* Subtitle - optional hint */}
      {subtitle && <p className="text-xs text-neutral-500 mt-1 sm:mt-sm">{subtitle}</p>}
    </div>
  );
};

const AdminOverviewPage = () => {
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } =
    useDashboardSummary();
  const { data: analytics, isLoading: isAnalyticsLoading, isError: isAnalyticsError } =
    useAnalytics(14);

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 sm:mb-2xl">
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Admin Overview</h1>
        <p className="mt-1 sm:mt-md text-sm sm:text-lg text-neutral-600">
          Platform-wide snapshot of hospitals, doctors, patients, and appointments.
        </p>
      </div>

      {/* KPI Cards - Platform Metrics */}
      {isSummaryLoading && <Spinner label="Loading dashboard…" />}
      {isSummaryError && <ErrorNotice message="Couldn't load the dashboard summary right now." />}

      {summary && (
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-md md:grid-cols-3 xl:grid-cols-6 mb-6 sm:mb-2xl">
          {/* Hospitals */}
          <AdminKPICard
            icon="🏥"
            label="Hospitals"
            value={summary.hospitals.active}
            subtitle={`${summary.hospitals.total} total`}
            className="from-blue-50 to-blue-0 border-blue-200"
          />

          {/* Doctors */}
          <AdminKPICard
            icon="👨‍⚕️"
            label="Doctors"
            value={summary.doctors.active}
            subtitle={`${summary.doctors.total} total`}
            className="from-teal-50 to-teal-0 border-teal-200"
          />

          {/* Patients */}
          <AdminKPICard
            icon="👥"
            label="Patients"
            value={summary.patients.total}
            className="from-upchar-50 to-upchar-0 border-upchar-200"
          />

          {/* Today's Appointments */}
          <AdminKPICard
            icon="📅"
            label="Appointments Today"
            value={summary.appointments.today}
            trend={summary.appointments.trendPct}
            subtitle="vs. prior week"
            className="from-gold-50 to-gold-0 border-gold-200"
          />

          {/* Active Queues */}
          <AdminKPICard
            icon="🔄"
            label="Active Queues"
            value={summary.activeQueuesToday}
            className="from-success-50 to-success-0 border-success-200"
          />

          {/* Revenue Today */}
          <AdminKPICard
            icon="💰"
            label="Revenue Today"
            value={formatCurrency(summary.revenue.today)}
            subtitle={`${formatCurrency(summary.revenue.total)} all-time`}
            className="from-neutral-50 to-neutral-0 border-neutral-200"
          />
        </div>
      )}

      {/* Charts Section */}
      <div className="space-y-6 sm:space-y-2xl">
        {/* Appointments & Status Breakdown */}
        <div className="grid gap-4 sm:gap-lg lg:grid-cols-3">
          <div className="lg:col-span-2 min-w-0">
            {isAnalyticsLoading && <Spinner label="Loading charts…" />}
            {isAnalyticsError && <ErrorNotice message="Couldn't load chart data right now." />}
            {analytics && <AppointmentsTrendChart data={analytics.appointmentsPerDay} subtitle="Last 14 days" />}
          </div>
          <div className="min-w-0">
            {analytics && <StatusBreakdownChart data={analytics.appointmentsByStatus} subtitle="Last 14 days" />}
          </div>
        </div>

        {/* Revenue Trend */}
        {analytics && (
          <div className="min-w-0">
            <RevenueTrendChart data={analytics.revenuePerDay} subtitle="Last 14 days, successful payments" />
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminOverviewPage;
