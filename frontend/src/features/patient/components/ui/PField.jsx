/**
 * Premium UpcharGanga Patient Form Field
 * Patient-facing variant with emerald green palette.
 * Same API as shared Field component (label/error/as/className/children/id/...rest)
 */
const baseControlClasses =
  'w-full rounded-md border border-upchar-200 bg-neutral-0 px-md py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-upchar-500 focus:outline-none focus:shadow-focus-ring disabled:bg-upchar-50 disabled:text-neutral-400';

const PField = ({ label, error, as = 'input', className = '', children, id, ...rest }) => {
  const Control = as;
  const controlId = id || rest.name;

  return (
    <label htmlFor={controlId} className={`block ${className}`}>
      {label && (
        <span className="mb-md block text-label font-medium uppercase tracking-wide text-neutral-700">
          {label}
        </span>
      )}
      <Control
        id={controlId}
        className={`${baseControlClasses} ${
          as === 'textarea' ? 'min-h-[120px] resize-y' : ''
        } ${error ? 'border-danger-500 bg-danger-50 text-danger-600' : ''}`}
        {...rest}
      >
        {children}
      </Control>
      {error && (
        <span className="mt-sm block text-caption font-medium text-danger-600">
          {error}
        </span>
      )}
    </label>
  );
};

export default PField;
