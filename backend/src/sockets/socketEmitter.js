const { getIO } = require('./socket');
const { patientRoom, queueRoom, hospitalRoom } = require('./rooms.util');
const SOCKET_EVENTS = require('./socketEvents');

/**
 * In-memory ring buffer of recent socket emissions for diagnostics and automated tests.
 */
const emittedEventsLog = [];
const MAX_LOG_SIZE = 500;

const safeGetIO = () => {
  try {
    return getIO();
  } catch (_err) {
    return null;
  }
};

const emitToRoom = (room, eventName, payload) => {
  const entry = {
    room,
    event: eventName,
    payload,
    emittedAt: new Date(),
  };
  emittedEventsLog.push(entry);
  if (emittedEventsLog.length > MAX_LOG_SIZE) {
    emittedEventsLog.shift();
  }

  const io = safeGetIO();
  if (io) {
    io.to(room).emit(eventName, payload);
  }
};

const getEmittedEvents = () => [...emittedEventsLog];
const clearEmittedEvents = () => {
  emittedEventsLog.length = 0;
};

// ---------------------------------------------------------------------
// Reception verifies patient -> Notify Patient
// ---------------------------------------------------------------------
const notifyPatientVerified = ({ patientId, appointmentId, bookingNumber }) => {
  if (!patientId) return;
  emitToRoom(patientRoom(patientId), SOCKET_EVENTS.PATIENT_VERIFIED, {
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
  if (!patientId) return;
  emitToRoom(patientRoom(patientId), SOCKET_EVENTS.PATIENT_CALLED, {
    appointmentId,
    tokenNumber,
    called: true,
    message: `It's your turn — Token #${tokenNumber}. Please proceed to the doctor's room.`,
    timestamp: new Date(),
  });
};

// ---------------------------------------------------------------------
// Broadcast queue update to staff watching this doctor/date queue and hospital
// ---------------------------------------------------------------------
const broadcastQueueUpdate = ({ doctorId, date, queue }) => {
  if (!queue) return;
  const resolvedDoctorId = doctorId?._id || doctorId || queue.doctor?._id || queue.doctor;
  const resolvedDate = date || queue.date;
  const resolvedHospitalId = queue.hospital?._id || queue.hospital;

  const payload = {
    queueId: queue._id,
    doctorId: resolvedDoctorId,
    hospitalId: resolvedHospitalId,
    date: resolvedDate,
    currentTokenNumber: queue.currentTokenNumber,
    totalTokensIssued: queue.totalTokensIssued,
    averageConsultationMinutes: queue.averageConsultationMinutes,
    status: queue.status,
    queueVersion: queue.queueVersion || 1,
    timingSummary: queue.timingSummary || null,
    timestamp: queue.lastRecalculatedAt || new Date(),
  };

  if (resolvedDoctorId && resolvedDate) {
    emitToRoom(queueRoom(resolvedDoctorId, resolvedDate), SOCKET_EVENTS.QUEUE_UPDATED, payload);
  }
  if (resolvedHospitalId) {
    emitToRoom(hospitalRoom(resolvedHospitalId.toString()), SOCKET_EVENTS.QUEUE_UPDATED, payload);
  }
};

/**
 * Pushes each patient in the queue their authoritative estimate, queue position,
 * and timing status (on-time, delayed-queue, ahead-of-schedule, late-patient,
 * in-consultation, pending-skip, completed, cancelled, doctor-unavailable).
 */
const notifyEstimatedConsultationTimes = (queue) => {
  if (!queue || !Array.isArray(queue.entries)) return;

  queue.entries.forEach((entry) => {
    const patientId = entry.patient?._id || entry.patient;
    if (!patientId) return;

    emitToRoom(patientRoom(patientId.toString()), SOCKET_EVENTS.PATIENT_ETA_UPDATED, {
      appointmentId: (entry.appointment?._id || entry.appointment)?.toString(),
      tokenNumber: entry.tokenNumber,
      status: entry.status,
      arrivalStatus: entry.arrivalStatus,
      queuePosition: entry.queuePosition,
      scheduledStartTime: entry.scheduledStartTime,
      scheduledEndTime: entry.scheduledEndTime,
      initialEstimatedStartTime: entry.initialEstimatedStartTime,
      initialEstimatedEndTime: entry.initialEstimatedEndTime,
      estimatedStartTime: entry.estimatedStartTime,
      estimatedEndTime: entry.estimatedEndTime,
      estimatedConsultationStartTime: entry.estimatedConsultationStartTime,
      estimatedConsultationEndTime: entry.estimatedConsultationEndTime,
      recommendedArrivalTime: entry.recommendedArrivalTime,
      estimatedWaitingMinutes: entry.estimatedWaitingMinutes,
      timingStatus: entry.timingStatus || 'on-time',
      delayMinutes: entry.delayMinutes || 0,
      aheadMinutes: entry.aheadMinutes || 0,
      statusLabel: entry.statusLabel || 'On Time',
      statusMessage: entry.statusMessage || null,
      recommendedAction: entry.recommendedAction || null,
      currentlyServingToken: queue.currentTokenNumber,
      averageConsultationMinutes: queue.averageConsultationMinutes,
      queueVersion: queue.queueVersion || 1,
      called: ['called', 'in-consultation'].includes(entry.status),
      timestamp: entry.lastUpdatedAt || queue.lastRecalculatedAt || new Date(),
    });
  });
};

/**
 * Single call-site combining both staff queue broadcast and per-patient ETA notifications.
 */
const broadcastQueueRecalculation = ({ doctorId, date, queue }) => {
  if (!queue) return;
  broadcastQueueUpdate({ doctorId, date, queue });
  notifyEstimatedConsultationTimes(queue);
};

const emitToHospital = (hospitalId, eventName, payload) => {
  if (!hospitalId) return;
  emitToRoom(hospitalRoom(hospitalId.toString()), eventName, {
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
  getEmittedEvents,
  clearEmittedEvents,
};
