const { getIO } = require('./socket');
const { patientRoom, queueRoom, hospitalRoom } = require('./rooms.util');
const SOCKET_EVENTS = require('./socketEvents');
const { QUEUE_ENTRY_STATUS } = require('../constants/enums');

/**
 * Centralized socket emission layer. This is the architectural guardrail
 * against duplicate events: module services (reception, doctorAssistant,
 * patients) NEVER call `getIO().emit(...)` directly — they call exactly
 * one of the named functions below. That guarantees:
 *
 *  1. Each logical event ("a patient was called") has exactly ONE
 *     function that can trigger it — there's no second code path that
 *     could fire the same event again with a slightly different payload
 *     or a mistyped room name.
 *  2. Event names and room-naming conventions are defined once (in
 *     socketEvents.js / rooms.util.js) and simply used here, not
 *     re-typed at every call site.
 *  3. If an event's payload shape ever needs to change, there is exactly
 *     one place to change it.
 */

// ---------------------------------------------------------------------
// Reception verifies patient -> Notify Patient
// ---------------------------------------------------------------------
const notifyPatientVerified = ({ patientId, appointmentId, bookingNumber }) => {
  getIO().to(patientRoom(patientId)).emit(SOCKET_EVENTS.PATIENT_VERIFIED, {
    appointmentId,
    bookingNumber,
    message: 'Your identity has been verified at reception.',
    timestamp: new Date(),
  });
};

// ---------------------------------------------------------------------
// Doctor Assistant calls patient -> Notify Patient
// ---------------------------------------------------------------------
const notifyPatientCalled = ({ patientId, appointmentId, tokenNumber }) => {
  getIO().to(patientRoom(patientId)).emit(SOCKET_EVENTS.PATIENT_CALLED, {
    appointmentId,
    tokenNumber,
    status: QUEUE_ENTRY_STATUS.CALLED,
    estimateStatus: 'called',
    estimatedConsultationStartTime: null,
    estimatedConsultationEndTime: null,
    message: `It's your turn — Token #${tokenNumber}. Please proceed to the doctor's room.`,
    timestamp: new Date(),
  });
};

// ---------------------------------------------------------------------
// Consultation completes (or a skip/cancellation changes the queue)
// -> Update queue, Update estimated time, Broadcast live updates
// ---------------------------------------------------------------------

/** Doctor/date-scoped snapshot for staff dashboards watching this queue. */
const broadcastQueueUpdate = ({ doctorId, date, queue }) => {
  getIO().to(queueRoom(doctorId, date)).emit(SOCKET_EVENTS.QUEUE_UPDATED, {
    currentTokenNumber: queue.currentTokenNumber,
    totalTokensIssued: queue.totalTokensIssued,
    averageConsultationMinutes: queue.averageConsultationMinutes,
    status: queue.status,
    timestamp: new Date(),
  });
};

/**
 * Pushes each patient their current queue estimate and status so waiting
 * patients receive time ranges and called/finished patients clear old estimates.
 *
 * Notifications are sent when a queue transition recalculates queue state;
 * time-based refreshes are handled by the appointment tracking endpoint.
 *
 * The frontend also deduplicates: it checks if the new times match the current
 * state before re-rendering, so even if we emit twice with the same values,
 * the frontend will not unnecessarily re-render.
 */
const notifyEstimatedConsultationTimes = (queue) => {
  const io = getIO();
  const currentlyServingEntry =
    queue.entries.find((entry) => entry.status === QUEUE_ENTRY_STATUS.IN_CONSULTATION) ||
    queue.entries.find((entry) => entry.status === QUEUE_ENTRY_STATUS.CALLED);
  const terminalStatuses = new Set([
    QUEUE_ENTRY_STATUS.COMPLETED,
    QUEUE_ENTRY_STATUS.SKIPPED,
    QUEUE_ENTRY_STATUS.NO_SHOW,
  ]);

  queue.entries.forEach((entry) => {
    const isTerminal = terminalStatuses.has(entry.status);
    const isCalled = entry.status === QUEUE_ENTRY_STATUS.CALLED;
    const isConsulting = entry.status === QUEUE_ENTRY_STATUS.IN_CONSULTATION;
    const isWaiting = [QUEUE_ENTRY_STATUS.WAITING, QUEUE_ENTRY_STATUS.PENDING].includes(entry.status);
    const canEstimate = isWaiting && queue.status === 'active' && entry.estimatedConsultationStartTime;

    io.to(patientRoom(entry.patient)).emit(SOCKET_EVENTS.PATIENT_ETA_UPDATED, {
      appointmentId: entry.appointment,
      estimatedConsultationStartTime: canEstimate ? entry.estimatedConsultationStartTime : null,
      estimatedConsultationEndTime: canEstimate ? entry.estimatedConsultationEndTime : null,
      queuePosition: isTerminal ? null : entry.queuePosition,
      queueEntriesAhead: isTerminal || entry.queuePosition == null
        ? null
        : Math.max(entry.queuePosition - 1, 0),
      currentServingTokenNumber: currentlyServingEntry?.tokenNumber ?? null,
      currentServingStatus: currentlyServingEntry?.status ?? null,
      currentTokenNumber: queue.currentTokenNumber,
      averageConsultationMinutes: queue.averageConsultationMinutes,
      queueStatus: queue.status,
      status: entry.status,
      estimateStatus: isCalled
        ? 'called'
        : isConsulting
          ? 'in-consultation'
          : isTerminal
            ? entry.status
            : queue.status === 'paused'
              ? 'queue-paused'
              : queue.status === 'closed'
                ? 'queue-closed'
                : entry.queuePosition === 1 && !currentlyServingEntry
                  ? 'next'
                  : 'waiting',
      timestamp: new Date(),
    });
  });
};


/**
 * Single call-site combining both queue update and ETA notifications — every place in the
 * codebase that calls QueueService.recalculateQueue() and wants to
 * broadcast the result calls this ONE function afterward, rather than
 * independently remembering to call both broadcastQueueUpdate and
 * notifyEstimatedConsultationTimes (and risking calling one twice or forgetting the
 * other).
 */
const broadcastQueueRecalculation = ({ doctorId, date, queue }) => {
  if (!queue) return; // recalculateQueue returns null if no queue exists yet
  broadcastQueueUpdate({ doctorId, date, queue });
  notifyEstimatedConsultationTimes(queue);
};

// ---------------------------------------------------------------------
// Doctor Unavailability Events -> Notify Hospital Staff
// ---------------------------------------------------------------------

/**
 * Broadcast doctor unavailability changes to all staff in a hospital.
 * Called when admin marks a doctor unavailable, updates, or removes the period.
 */
const emitToHospital = (hospitalId, eventName, payload) => {
  getIO().to(hospitalRoom(hospitalId)).emit(eventName, {
    ...payload,
    timestamp: new Date(),
  });
};

module.exports = {
  notifyPatientVerified,
  notifyPatientCalled,
  broadcastQueueUpdate,
  notifyEstimatedConsultationTimes,
  broadcastQueueRecalculation,
  emitToHospital,
};
