const { WEEKDAYS } = require('../constants/enums');

/**
 * Deterministic clock override for automated testing.
 * In production, mockNow is null and getHospitalNow() uses Date.now().
 */
let mockNow = null;

const setMockNow = (dateInput) => {
  if (dateInput === null || dateInput === undefined) {
    mockNow = null;
    return;
  }
  mockNow = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput);
};

const resetMockNow = () => {
  mockNow = null;
};

const isMockNowActive = () => mockNow !== null;

/** Strips the time component, returning a Date at UTC midnight. Lets us
 * compare/store "appointment day" as a simple equality check. */
const normalizeDateOnly = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/** Maps a Date to one of WEEKDAYS ('monday'..'sunday'), matching the
 * lowercase day names used in Doctor.availability. */
const getWeekdayName = (date) => {
  const jsDay = new Date(date).getUTCDay(); // 0=Sunday..6=Saturday
  const mondayFirstIndex = jsDay === 0 ? 6 : jsDay - 1;
  return WEEKDAYS[mondayFirstIndex];
};

const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

const minutesToTime = (totalMinutes) => {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440; // wrap safely within a day
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const addMinutesToTime = (timeStr, minutesToAdd) =>
  minutesToTime(timeToMinutes(timeStr) + minutesToAdd);

const isTimeAfter = (a, b) => timeToMinutes(a) > timeToMinutes(b);

/** Combines a date-only Date with an "HH:mm" string into one full Date.
 * Uses UTC getters/setters consistently across the codebase. */
const combineDateAndTime = (date, timeStr) => {
  const d = normalizeDateOnly(date);
  const [h, m] = String(timeStr || '00:00').split(':').map(Number);
  d.setUTCHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
};

/** Converts a Date (created via combineDateAndTime or getHospitalNow) into "HH:mm"
 * using UTC hours/minutes so it never drifts with the host OS timezone. */
const datetimeToTimeString = (datetime) => {
  if (!datetime) return null;
  if (typeof datetime === 'string' && /^\d{2}:\d{2}$/.test(datetime)) return datetime;
  const d = datetime instanceof Date ? datetime : new Date(datetime);
  if (Number.isNaN(d.getTime())) return null;
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/** Formats an "HH:mm" string or Date into "10:00 AM" / "02:15 PM" without double timezone shift. */
const formatTime12h = (value) => {
  const hm = typeof value === 'string' && /^\d{2}:\d{2}/.test(value)
    ? value.slice(0, 5)
    : datetimeToTimeString(value);
  if (!hm) return '—';
  const [h24, m] = hm.split(':').map(Number);
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** The current moment in hospital wall-clock time (UTC getters represent IST).
 * When mockNow is active in automated tests, returns a clone of mockNow. */
const getHospitalNow = () => {
  if (mockNow !== null) {
    return new Date(mockNow.getTime());
  }
  return new Date(Date.now() + IST_OFFSET_MINUTES * 60 * 1000);
};

/** "HH:mm" for right now (in hospital-local/IST time), rounded UP to
 * the next 5-minute mark. */
const getCurrentTimeString = () => {
  const now = getHospitalNow();
  const rawMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const roundedMinutes = Math.ceil(rawMinutes / 5) * 5;
  return minutesToTime(roundedMinutes % 1440);
};

/** Whether two dates fall on the same calendar day (UTC, ignoring time). */
const isSameUTCDate = (a, b) => normalizeDateOnly(a).getTime() === normalizeDateOnly(b).getTime();

module.exports = {
  normalizeDateOnly,
  getWeekdayName,
  timeToMinutes,
  minutesToTime,
  addMinutesToTime,
  isTimeAfter,
  combineDateAndTime,
  datetimeToTimeString,
  formatTime12h,
  getCurrentTimeString,
  getHospitalNow,
  isSameUTCDate,
  setMockNow,
  resetMockNow,
  isMockNowActive,
};
