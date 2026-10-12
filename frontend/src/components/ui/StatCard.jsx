/**
 * Premium UpcharGanga Stat Card component.
 * KPI metric display: big number + label + optional trend % + hint.
 * Used across Admin dashboards for quick headline figures.
 */
const StatCard = ({ label, value, trendPct = null, hint = null }) => {
  const isPositive = typeof trendPct === 'number' && trendPct > 0;
  const isNegative = typeof trendPct === 'number' && trendPct < 0;

  return (
    <div className="rounded-lg border border-neutral-100 bg-neutral-0 p-5 shadow-base transition-all duration-base hover:shadow-md">
      <p className="text-label font-medium uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="mt-lg text-3xl font-bold text-neutral-900">{value}</p>
      <div className="mt-lg flex items-center gap-md">
        {trendPct !== null && (
          <span
            className={`inline-flex items-center gap-xs text-caption font-semibold transition-colors duration-fast ${
              isPositive ? 'text-success-600' : isNegative ? 'text-danger-600' : 'text-neutral-500'
            }`}
          >
            {isPositive && '↑'}
            {isNegative && '↓'}
            {Math.abs(trendPct)}%
          </span>
        )}
        {hint && <span className="text-caption text-neutral-500">{hint}</span>}
      </div>
    </div>
  );
};

export default StatCard;
