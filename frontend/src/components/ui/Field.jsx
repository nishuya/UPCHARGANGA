/**
 * Premium UpcharGanga Form Field component.
 * Label + input/select/textarea + error wrapper with consistent styling.
 * Works across all panels (operational + patient).
 */
const baseControlClasses =
  'w-full rounded-md border border-neutral-200 bg-neutral-0 px-3 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 transition-all duration-fast focus:border-upchar-500 focus:shadow-focus-ring focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed';

const Field = ({ label, error, as = 'input', className = '', children, id, ...rest }) => {
  const Control = as;
  const controlId = id || rest.name;

  return (
    <label htmlFor={controlId} className={`block ${className}`}>
      {label && (
        <span className="mb-md block text-label font-medium text-neutral-700 uppercase tracking-wide">
          {label}
        </span>
      )}
      <Control
        id={controlId}
        className={`${baseControlClasses} ${as === 'textarea' ? 'min-h-[120px] resize-y' : ''} ${
          error ? 'border-danger-500 bg-danger-50' : ''
        }`}
        {...rest}
      >
        {children}
      </Control>
      {error && (
        <span className="mt-sm block text-caption font-medium text-danger-600">{error}</span>
      )}
    </label>
  );
};

export default Field;
