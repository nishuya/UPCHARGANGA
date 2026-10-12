/**
 * Avatar Component
 * Generates beautiful fallback avatars with initials and color coding
 */

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
};

const getAvatarColor = (name) => {
  const colors = [
    { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
    { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
    { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
    { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
    { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
    { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
    { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
    { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  ];

  if (!name) return colors[0];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
};

const Avatar = ({
  name = 'User',
  size = 'md',
  className = '',
}) => {
  const initials = getInitials(name);
  const colorConfig = getAvatarColor(name);

  const sizeClasses = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-lg',
    xl: 'w-20 h-20 text-2xl',
  };

  return (
    <div
      className={`
        flex items-center justify-center rounded-full font-bold border-2
        ${sizeClasses[size]}
        ${colorConfig.bg}
        ${colorConfig.text}
        ${colorConfig.border}
        ${className}
      `}
      title={name}
    >
      {initials}
    </div>
  );
};

export default Avatar;
