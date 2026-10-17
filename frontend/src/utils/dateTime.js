export const formatHospitalTime = (value) => {
  if (!value) return '—';
  if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) {
    return value.substring(0, 5);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  // The backend stores India-local wall-clock times in UTC date fields.
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
};
