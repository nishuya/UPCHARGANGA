/**
 * Premium UpcharGanga State Notice Components
 * Reusable empty state, error notice, and loading spinner.
 * Consistent styling across all panels.
 */

export const EmptyState = ({ title, description, action }) => (
  <div className="flex flex-col items-center justify-center gap-md rounded-lg border border-dashed border-neutral-200 bg-neutral-50 py-3xl px-lg text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-neutral-100">
      <svg className="h-6 w-6 text-neutral-400" fill="none" viewBox="0 0 24 24">
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    </div>
    <p className="text-h3 font-semibold text-neutral-900">{title}</p>
    {description && <p className="max-w-sm text-body-sm text-neutral-600">{description}</p>}
    {action && <div className="mt-lg">{action}</div>}
  </div>
);

export const ErrorNotice = ({ message = 'Something went wrong. Please try again.', action }) => (
  <div className="flex flex-col items-center justify-center gap-md rounded-lg border border-danger-200 bg-danger-50 py-2xl px-lg text-center">
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger-100">
      <svg className="h-5 w-5 text-danger-600" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    </div>
    <p className="text-body font-semibold text-danger-700">{message}</p>
    {action && <div className="mt-md">{action}</div>}
  </div>
);

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="flex flex-col items-center justify-center gap-lg py-3xl">
    <div className="h-8 w-8 animate-spin rounded-full border-3 border-neutral-200 border-t-upchar-500" />
    <p className="text-body-sm text-neutral-600">{label}</p>
  </div>
);

/**
 * StateNotice Component - Unified interface
 * type: 'empty', 'error', 'loading'
 */
const StateNotice = ({ type = 'empty', title, description, message, action, label }) => {
  switch (type) {
    case 'error':
      return <ErrorNotice message={message || description} action={action} />;
    case 'loading':
      return <Spinner label={label || description} />;
    case 'empty':
    default:
      return <EmptyState title={title} description={description} action={action} />;
  }
};

export default StateNotice;

