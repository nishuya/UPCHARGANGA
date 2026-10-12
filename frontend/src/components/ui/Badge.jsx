/**
 * Premium UpcharGanga Status Badge component.
 * Displays appointment/queue status with semantic colors and professional styling.
 * Colors are looked up by backend status string to keep styling centralized.
 */
const STATUS_STYLES = {
  pending: 'bg-warning-50 text-warning-600 border border-warning-200',
  confirmed: 'bg-success-50 text-success-600 border border-success-200',
  'checked-in': 'bg-info-50 text-info-600 border border-info-200',
  'in-consultation': 'bg-upchar-50 text-upchar-600 border border-upchar-200',
  completed: 'bg-success-50 text-success-600 border border-success-200',
  cancelled: 'bg-danger-50 text-danger-600 border border-danger-200',
  'no-show': 'bg-danger-50 text-danger-600 border border-danger-200',
};

const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  'checked-in': 'Checked In',
  'in-consultation': 'In Consultation',
  completed: 'Completed',
  cancelled: 'Cancelled',
  'no-show': 'No Show',
};

const Badge = ({ status }) => (
  <span
    className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-fast ${
      STATUS_STYLES[status] || 'bg-neutral-100 text-neutral-600 border border-neutral-200'
    }`}
  >
    {STATUS_LABELS[status] || status}
  </span>
);

export default Badge;
