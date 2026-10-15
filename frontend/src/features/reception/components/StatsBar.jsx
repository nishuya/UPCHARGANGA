const STAT_DEFS = [
  {
    key: 'waiting',
    label: 'Waiting',
    statuses: ['pending', 'confirmed'],
    color: 'from-blue-50 to-blue-0 border-blue-200',
    textColor: 'text-blue-700',
  },
  {
    key: 'checked-in',
    label: 'Checked In',
    statuses: ['checked-in'],
    color: 'from-teal-50 to-teal-0 border-teal-200',
    textColor: 'text-teal-700',
  },
  {
    key: 'in-consultation',
    label: 'In Consultation',
    statuses: ['in-consultation'],
    color: 'from-upchar-50 to-upchar-0 border-upchar-200',
    textColor: 'text-upchar-700',
  },
  {
    key: 'completed',
    label: 'Completed',
    statuses: ['completed'],
    color: 'from-success-50 to-success-0 border-success-200',
    textColor: 'text-success-700',
  },
  {
    key: 'no-show',
    label: 'No-show / Cancelled',
    statuses: ['no-show', 'cancelled'],
    color: 'from-neutral-50 to-neutral-0 border-neutral-200',
    textColor: 'text-neutral-600',
  },
];

const StatsBar = ({ appointments = [] }) => {
  const stats = STAT_DEFS.map((stat) => {
    const count = appointments.filter((a) => stat.statuses.includes(a.status)).length;
    return { ...stat, count };
  });

  return (
    <div className="rounded-xl border border-neutral-200 bg-gradient-to-r from-neutral-0 to-neutral-50 p-3 sm:p-lg">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-md">
        {stats.map((stat) => (
          <div
            key={stat.key}
            className={`rounded-lg border-2 bg-gradient-to-br ${stat.color} px-3.5 py-3 sm:px-lg sm:py-lg transition-all duration-fast hover:shadow-md`}
          >
            <p className={`text-2xl sm:text-4xl font-black ${stat.textColor} mb-1`}>
              {stat.count}
            </p>
            <p className="text-caption sm:text-body-sm font-semibold text-neutral-600">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatsBar;
