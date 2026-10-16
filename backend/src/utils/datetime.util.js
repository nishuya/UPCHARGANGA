const { WEEKDAYS } = require('../constants/enums');

const IST_OFFSET_MINUTES = 330;
const MINUTE_MS = 60 * 1000;

const normalizeDateOnly = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }

  // Appointment dates are stored as UTC midnight representing
  // the selected IST calendar date.
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
};

const getWeekdayName = (value) => {
  const date = normalizeDateOnly(value);
  const sundayFirst = date.getUTCDay();
  const mondayFirst = (sundayFirst + 6) % 7;

  return WEEKDAYS[mondayFirst];
};

const timeToMinutes = (time) => {
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error(`Invalid time "${time}". Expected HH:mm.`);
  }

  const [hours, minutes] = time.split(':').map(Number);

  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid time "${time}".`);
  }

  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes) => {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const addMinutesToTime = (time, minutes) =>
  minutesToTime(timeToMinutes(time) + minutes);

const isTimeAfter = (a, b) =>
  timeToMinutes(a) > timeToMinutes(b);

/**
 * Convert an IST wall-clock time on an appointment date to a real Date.
 *
 * Example:
 * appointment date = 2026-10-16
 * time = 09:00 IST
 * resulting instant = 2026-10-16T03:30:00.000Z
 *
 * Do not use getHours()/setHours() on this result to read IST time.
 */
const combineDateAndTime = (dateValue, time) => {
  const date = normalizeDateOnly(dateValue);
  const minutes = timeToMinutes(time);

  return new Date(
    date.getTime() + (minutes - IST_OFFSET_MINUTES) * MINUTE_MS
  );
};

/**
 * Current real instant. Safe to store in MongoDB Date fields.
 */
const getHospitalNow = () => new Date();

/**
 * Read the current IST wall-clock time.
 */
const getCurrentTimeString = () => {
  const ist = new Date(Date.now() + IST_OFFSET_MINUTES * MINUTE_MS);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();

  // Round up to the next five-minute boundary.
  return minutesToTime(Math.ceil(minutes / 5) * 5);
};

/**
 * Get the current IST calendar date represented as UTC midnight.
 */
const getHospitalToday = () => {
  const ist = new Date(Date.now() + IST_OFFSET_MINUTES * MINUTE_MS);

  return new Date(Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate()
  ));
};

const isSameUTCDate = (a, b) =>
  normalizeDateOnly(a).getTime() === normalizeDateOnly(b).getTime();

/**
 * Format a real instant as IST HH:mm.
 */
const formatISTTime = (value) => {
  const date = new Date(new Date(value).getTime() + IST_OFFSET_MINUTES * MINUTE_MS);

  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(
    date.getUTCMinutes()
  ).padStart(2, '0')}`;
};

module.exports = {
  IST_OFFSET_MINUTES,
  normalizeDateOnly,
  getWeekdayName,
  timeToMinutes,
  minutesToTime,
  addMinutesToTime,
  isTimeAfter,
  combineDateAndTime,
  getCurrentTimeString,
  getHospitalNow,
  getHospitalToday,
  isSameUTCDate,
  formatISTTime,
};