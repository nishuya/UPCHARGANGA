/**
 * Premium UpcharGanga Card component.
 * Base card used across all operational panels.
 * Supports interactive (clickable) and static variants.
 * Patient surface uses PCard which maintains separate styling.
 */
const Card = ({ children, onClick, selected = false, variant = 'default', className = '', as = 'div' }) => {
  const Tag = onClick ? 'button' : as;

  const baseClasses =
    'rounded-lg border bg-neutral-0 p-5 text-left transition-all duration-base outline-none focus-visible:outline-none';

  const staticClasses = selected
    ? 'border-upchar-500 shadow-md'
    : 'border-neutral-100 shadow-base';

  const interactiveClasses = onClick
    ? `w-full cursor-pointer hover:-translate-y-0.5 ${
        selected ? 'border-upchar-500 shadow-lg' : 'border-neutral-100 hover:border-upchar-200 hover:shadow-md'
      }`
    : '';

  // Variant: success card (positive state)
  if (variant === 'success') {
    return (
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`${baseClasses} border-l-4 border-l-success-500 bg-success-50 border-success-500 ${className}`}
      >
        {children}
      </Tag>
    );
  }

  // Variant: warning card (caution state)
  if (variant === 'warning') {
    return (
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`${baseClasses} border-l-4 border-l-warning-500 bg-warning-50 border-warning-500 ${className}`}
      >
        {children}
      </Tag>
    );
  }

  // Variant: danger card (problem state)
  if (variant === 'danger') {
    return (
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`${baseClasses} border-l-4 border-l-danger-500 bg-danger-50 border-danger-500 ${className}`}
      >
        {children}
      </Tag>
    );
  }

  // Default: standard card
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${baseClasses} ${staticClasses} ${interactiveClasses} ${className}`}
    >
      {children}
    </Tag>
  );
};

export default Card;
