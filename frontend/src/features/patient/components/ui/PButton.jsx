/**
 * Premium UpcharGanga Patient Button
 * Patient-facing variant with emerald green palette.
 * Drop-in replacement for shared Button component on patient surface.
 */
const VARIANTS = {
  primary: 'bg-upchar-500 text-white hover:bg-upchar-600 focus-visible:shadow-focus-ring',
  secondary:
    'bg-neutral-100 text-neutral-700 border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 focus-visible:shadow-focus-ring',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 focus-visible:shadow-focus-ring',
  ghost: 'bg-transparent text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 focus-visible:shadow-focus-ring',
};

const SIZES = {
  sm: 'px-md py-1.5 text-sm',
  md: 'px-lg py-2.5 text-sm',
  lg: 'px-xl py-3 text-base',
};

const PButton = ({
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
    className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-fast outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    {...rest}
  >
    {isLoading && (
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/20 border-t-current" />
    )}
    {children}
  </button>
);

export default PButton;
