const HOSPITAL_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const ESTIMATE_STATUS_MESSAGES = {
  called: 'Your turn — please proceed to the doctor.',
  'in-consultation': 'Doctor is currently seeing you.',
  next: 'You are next in line.',
  completed: 'Consultation completed.',
  skipped: 'This appointment was skipped. Please contact reception.',
  'no-show': 'This appointment was marked no-show. Please contact reception.',
  cancelled: 'Appointment cancelled.',
  expired: 'Appointment expired.',
  'queue-paused': 'Queue is paused. Your estimate will update when it resumes.',
  'queue-closed': 'The queue is closed.',
  'doctor-unavailable': 'The doctor is currently unavailable. Please contact reception.',
  past: 'The appointment date has passed.',
  'not-started': 'An estimate will appear when the queue opens.',
};

export const formatHospitalTime = (value) => {
  if (!value) return 'N/A';
  if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) {
    return value.substring(0, 5);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
};

export const formatHospitalAddress = (hospital) => {
  if (!hospital) return '';

  const address = hospital.address || {};
  const city = hospital.city;
  const cityName = typeof city === 'string' ? city : city?.name;
  const locality = [cityName, typeof city === 'object' ? city?.state : null]
    .filter(Boolean)
    .join(', ');
  const localityAndPostalCode = [locality, address.pincode].filter(Boolean).join(' ');

  return [
    address.line1,
    address.line2,
    localityAndPostalCode,
    typeof city === 'object' ? city?.country : null,
  ]
    .filter(Boolean)
    .join(', ');
};

export const hasHospitalEstimatePassed = (value, now = Date.now()) => {
  if (!value) return false;
  const estimate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(estimate.getTime())) return false;
  return estimate.getTime() <= now + HOSPITAL_OFFSET_MS;
};

export const getEstimateText = (queueEntry, currentTime = Date.now()) => {
  if (!queueEntry) return 'Updating estimate…';

  const estimateHasPassed = hasHospitalEstimatePassed(
    queueEntry.estimatedConsultationStartTime,
    currentTime
  );
  if (
    queueEntry.estimatedConsultationStartTime &&
    queueEntry.estimatedConsultationEndTime &&
    !estimateHasPassed
  ) {
    return `${formatHospitalTime(queueEntry.estimatedConsultationStartTime)} - ${formatHospitalTime(queueEntry.estimatedConsultationEndTime)}`;
  }

  if (estimateHasPassed) return 'Updating estimate…';
  return (
    ESTIMATE_STATUS_MESSAGES[queueEntry.estimateStatus] ||
    (queueEntry.queuePosition ? `Queue position: ${queueEntry.queuePosition}` : 'Estimate unavailable')
  );
};
