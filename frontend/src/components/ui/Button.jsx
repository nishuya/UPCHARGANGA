/**
 * Premium UpcharGanga Button component.
 * Used across all operational panels (Reception, Doctor, Admin).
 * Patient surface uses PButton (in features/patient) which maintains separate styling.
 */
const VARIANTS = {
  primary: 'bg-upchar-500 text-white hover:bg-upchar-600 focus-visible:shadow-focus-ring',
  secondary:
    'bg-neutral-100 text-neutral-700 border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 focus-visible:shadow-focus-ring',
  ghost: 'bg-transparent text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 focus-visible:shadow-focus-ring',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 focus-visible:shadow-focus-ring',
  success: 'bg-success-500 text-white hover:bg-success-600 focus-visible:shadow-focus-ring',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm font-medium',
  md: 'px-4 py-2.5 text-sm font-medium',
  lg: 'px-5 py-3 text-base font-medium',
};

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  type = 'button',
  className = '',
  ...rest
}) => (
  <button
    type={type}
    disabled={disabled || isLoading}
    className={`inline-flex items-center justify-center gap-2 rounded-md transition-all duration-fast disabled:cursor-not-allowed disabled:opacity-60 outline-none focus-visible:outline-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    {...rest}
  >
    {isLoading && (
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/20 border-t-current" />
    )}
    {children}
  </button>
);

export default Button;
