/**
 * Every event name used anywhere in the socket layer, in one place.
 * Business logic never hand-writes an event-name string — it imports
 * from here. This is the second half (alongside rooms.util.js) of
 * preventing "duplicate-looking but actually mismatched" events: a typo
 * in a string literal (`'patient:Called'` vs `'patient:called'`) would
 * silently create a second, dead event name instead of raising an error.
 */
module.exports = Object.freeze({
  // Server -> client (patient's personal room)
  PATIENT_VERIFIED: 'patient:verified',
  PATIENT_CALLED: 'patient:called',
  PATIENT_ETA_UPDATED: 'patient:eta-updated',

  // Server -> client (doctor/date queue room — staff dashboards)
  QUEUE_UPDATED: 'queue:updated',

  // Server -> client (hospital room — doctor availability changes)
  DOCTOR_UNAVAILABILITY_CREATED: 'doctor:unavailability-created',
  DOCTOR_UNAVAILABILITY_UPDATED: 'doctor:unavailability-updated',
  DOCTOR_UNAVAILABILITY_DELETED: 'doctor:unavailability-deleted',

  // Client -> server
  QUEUE_SUBSCRIBE: 'queue:subscribe',
  QUEUE_UNSUBSCRIBE: 'queue:unsubscribe',
});
