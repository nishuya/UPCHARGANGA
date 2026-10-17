const HOSPITAL_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

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

export const hasHospitalEstimatePassed = (value, now = Date.now()) => {
  if (!value) return false;
  const estimate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(estimate.getTime())) return false;
  return estimate.getTime() <= now + HOSPITAL_OFFSET_MS;
};
