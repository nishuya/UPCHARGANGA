import Button from './Button';

/**
 * Premium UpcharGanga Pagination Component
 * Page/limit control for all admin lists (Hospitals, Doctors, Patients, Appointments, etc).
 * Handles pagination navigation and displays record range.
 */
const Pagination = ({ page, limit, total, onPageChange }) => {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  if (totalPages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="mt-xl flex flex-wrap items-center justify-between gap-lg">
      <p className="text-caption text-neutral-600">
        Showing <span className="font-semibold text-neutral-900">{from}</span>–
        <span className="font-semibold text-neutral-900">{to}</span> of{' '}
        <span className="font-semibold text-neutral-900">{total}</span>
      </p>

      <div className="flex items-center gap-md">
        <Button
          size="sm"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Previous
        </Button>

        <span className="text-caption font-medium text-neutral-600 px-md py-2">
          Page <span className="font-semibold text-neutral-900">{page}</span> of{' '}
          <span className="font-semibold text-neutral-900">{totalPages}</span>
        </span>

        <Button
          size="sm"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
};

export default Pagination;
