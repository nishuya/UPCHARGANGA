const ApiError = require('../errors/ApiError');
const { timeToMinutes, minutesToTime } = require('./datetime.util');

/**
 * Consultation length for a doctor's session. Always read from the
 * doctor's availability record (`slotDurationMinutes`) — never hardcoded.
 */
const resolveConsultationDuration = (daySchedule) => {
  const duration = Number(daySchedule?.slotDurationMinutes);
  if (!Number.isFinite(duration) || duration < 1) {
    throw new ApiError(
      500,
      'Doctor schedule is not properly configured. Consultation duration is missing.'
    );
  }
  return duration;
};

const sessionEndMinutes = (endTime) => (endTime === '00:00' ? 1440 : timeToMinutes(endTime));

const laterTime = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return timeToMinutes(a) >= timeToMinutes(b) ? a : b;
};

const maxTimeString = (times = []) =>
  times.reduce((latest, current) => laterTime(latest, current), null);

/**
 * Next unique {start, end} slot for a doctor session.
 *
 * Floor is the latest of:
 *   1. session opening (or token-grid start, if provided)
 *   2. the latest end time already assigned on this doctor/date
 *   3. current hospital time when booking for today (never in the past)
 *   4. optional atomic cursor (lastAssignedSlotEndMinutes) from the Queue doc
 *
 * Duration always comes from the caller (doctor.availability.slotDurationMinutes).
 */
const allocateNextTimeSlot = ({
  startTime,
  endTime,
  durationMinutes,
  occupyingEndTimes = [],
  gridStartTime = null,
  isToday = false,
  nowTimeString = null,
  lastAssignedSlotEndMinutes = null,
}) => {
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration < 1) {
    throw new ApiError(
      500,
      'Doctor schedule is not properly configured. Consultation duration is missing.'
    );
  }

  let start = gridStartTime || startTime;
  start = laterTime(start, startTime);

  const latestOccupiedEnd = maxTimeString(occupyingEndTimes);
  if (latestOccupiedEnd) {
    start = laterTime(start, latestOccupiedEnd);
  }

  if (
    lastAssignedSlotEndMinutes != null &&
    Number.isFinite(Number(lastAssignedSlotEndMinutes))
  ) {
    start = laterTime(start, minutesToTime(Number(lastAssignedSlotEndMinutes)));
  }

  if (isToday && nowTimeString) {
    start = laterTime(start, nowTimeString);
  }

  const startMin = timeToMinutes(start);
  const endMin = startMin + duration;
  const limit = sessionEndMinutes(endTime);

  if (startMin >= limit || endMin > limit) {
    throw new ApiError(
      409,
      'No valid appointment slots are available for this doctor in the selected session.'
    );
  }

  return {
    start,
    end: minutesToTime(endMin),
  };
};

/**
 * Pure helper: given a floor (minutes) and an optional previous cursor,
 * return the next {startMinutes, endMinutes} pair.
 * Used by the atomic Queue cursor update so concurrent bookers cannot collide.
 */
const nextSlotFromCursor = (floorMinutes, previousEndMinutes, durationMinutes) => {
  const duration = Number(durationMinutes);
  const floor = Number(floorMinutes);
  const prev =
    previousEndMinutes == null || !Number.isFinite(Number(previousEndMinutes))
      ? null
      : Number(previousEndMinutes);
  const startMinutes = prev == null ? floor : Math.max(floor, prev);
  return {
    startMinutes,
    endMinutes: startMinutes + duration,
  };
};

module.exports = {
  resolveConsultationDuration,
  allocateNextTimeSlot,
  nextSlotFromCursor,
  laterTime,
  maxTimeString,
  sessionEndMinutes,
};
