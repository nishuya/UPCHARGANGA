/**
 * Premium UpcharGanga Patient Card
 * Patient-facing variant with emerald green palette and soft styling.
 * Used for city/hospital/doctor selection, appointment cards, etc.
 */
const PCard = ({ children, onClick, selected = false, className = '', as = 'div' }) => {
  const Tag = onClick ? 'button' : as;

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-xl border bg-neutral-0 p-5 text-left transition-all duration-base outline-none focus-visible:outline-none ${
        selected ? 'border-upchar-500 ring-2 ring-upchar-200 shadow-md' : 'border-upchar-100 shadow-base'
      } ${
        onClick
          ? 'w-full cursor-pointer hover:-translate-y-0.5 hover:border-upchar-400 hover:shadow-md'
          : ''
      } ${className}`}
    >
      {children}
    </Tag>
  );
};

export default PCard;
