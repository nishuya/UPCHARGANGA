import Card from './Card';

/**
 * Premium UpcharGanga Chart Card Component
 * Generic chart frame for all admin analytics (Overview, Reports, etc).
 * Owns the title/subtitle header and fixed-height container for Recharts ResponsiveContainer.
 */
const ChartCard = ({ title, subtitle, height = 300, action = null, children }) => (
  <Card className="flex flex-col">
    <div className="flex items-start justify-between gap-lg pb-lg border-b border-neutral-100">
      <div>
        <h3 className="text-h3 font-semibold text-neutral-900">{title}</h3>
        {subtitle && (
          <p className="mt-sm text-caption text-neutral-600">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
    <div className="mt-lg" style={{ height }}>
      {children}
    </div>
  </Card>
);

export default ChartCard;
