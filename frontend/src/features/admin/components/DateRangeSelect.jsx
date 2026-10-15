const RANGE_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

const DateRangeSelect = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {RANGE_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
          value === opt.value
            ? 'bg-upchar-600 text-white shadow-sm'
            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

export default DateRangeSelect;
