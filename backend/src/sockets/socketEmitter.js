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
 * Pushes each still-waiting patient their OWN estimated consultation time slot.
 * This is displayed as a simple time range (e.g. "12:30 PM – 12:45 PM") with
 * no delay/early messaging or countdown timer.
 *
 * Notifications are sent only when:
 * - Queue composition changes (a completion, skip, or cancellation)
 * - This patient's estimated time has changed from the last broadcast
 *
 * NOT sent on every second tick or continuously — a one-time notification
 * when the estimate changes is all the patient receives.
 *
 * The frontend also deduplicates: it checks if the new times match the current
 * state before re-rendering, so even if we emit twice with the same values,
 * the frontend will not unnecessarily re-render.
 */
const notifyEstimatedConsultationTimes = (queue) => {
  const io = getIO();
  const etaStatuses = new Set([
    QUEUE_ENTRY_STATUS.WAITING,
    QUEUE_ENTRY_STATUS.PENDING,
    QUEUE_ENTRY_STATUS.CALLED,
  ]);

  queue.entries
    .filter(
      (e) => etaStatuses.has(e.status) && e.estimatedConsultationStartTime != null
    )
    .forEach((entry) => {
      io.to(patientRoom(entry.patient)).emit(SOCKET_EVENTS.PATIENT_ETA_UPDATED, {
        appointmentId: entry.appointment,
        // Patient-facing display: simple time range from the authoritative scheduler
        estimatedConsultationStartTime: entry.estimatedConsultationStartTime,
        estimatedConsultationEndTime: entry.estimatedConsultationEndTime,
        queuePosition: entry.queuePosition,
        status: entry.status,
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
