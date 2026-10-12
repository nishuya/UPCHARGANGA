/**
 * MUST stay in sync with backend/src/sockets/socketEvents.js — same
 * duplication trade-off as roles.js above. Importing from here (never a
 * hand-typed event string) is what lets `grep` actually find every
 * place a given event is used.
 */
export const SOCKET_EVENTS = Object.freeze({
  // Server -> client (patient's personal room)
  PATIENT_VERIFIED: 'patient:verified',
  PATIENT_CALLED: 'patient:called',
  PATIENT_ETA_UPDATED: 'patient:eta-updated',

  // Server -> client (doctor/date queue room — staff dashboards)
  QUEUE_UPDATED: 'queue:updated',

  // Server -> client (doctor unavailability updates - affects booking availability)
  DOCTOR_UNAVAILABILITY_CREATED: 'doctor:unavailability-created',
  DOCTOR_UNAVAILABILITY_UPDATED: 'doctor:unavailability-updated',
  DOCTOR_UNAVAILABILITY_DELETED: 'doctor:unavailability-deleted',

  // Client -> server
  QUEUE_SUBSCRIBE: 'queue:subscribe',
  QUEUE_UNSUBSCRIBE: 'queue:unsubscribe',
});
