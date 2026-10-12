const express = require('express');
const router = express.Router();

const receptionController = require('./reception.controller');
const validate = require('../../middlewares/validate.middleware');
const validateQuery = require('../../middlewares/validateQuery.middleware');
const validateObjectId = require('../../middlewares/validateObjectId.middleware');
const protect = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const requireHospitalAccess = require('../../middlewares/requireHospitalAccess.middleware');
const { USER_ROLES } = require('../../constants/enums');
const {
  searchBookingSchema,
  todaysAppointmentsQuerySchema,
  verifyPatientSchema,
  collectPaymentSchema,
  updateStatusSchema,
} = require('./reception.validation');

/**
 * Every route here is Reception (Panel 1) only.
 *
 * SECURITY: All reception endpoints are protected by:
 * 1. protect - verifies JWT token
 * 2. authorize('receptionist') - ensures user has receptionist role
 * 3. requireHospitalAccess - ensures receptionist can only access own hospital
 */
router.use(protect, authorize(USER_ROLES.RECEPTIONIST), requireHospitalAccess);

// ========================================================================
// READ OPERATIONS - Get appointment data
// ========================================================================

// 1. Get today's appointments (main dashboard data)
/**
 * GET /api/reception/appointments/today
 * SECURITY: requireHospitalAccess ensures only own hospital's appointments returned
 */
router.get(
  '/appointments/today',
  validateQuery(todaysAppointmentsQuerySchema),
  receptionController.getTodaysAppointments
);

// 2. Search Booking Number
/**
 * GET /api/reception/appointments/search
 * SECURITY: requireHospitalAccess ensures only own hospital's appointments returned
 */
router.get(
  '/appointments/search',
  validateQuery(searchBookingSchema),
  receptionController.searchByBookingNumber
);

// 3. Get queue for a doctor
/**
 * GET /api/reception/queue/:doctorId
 * SECURITY: requireHospitalAccess ensures doctor is in receptionist's hospital
 */
router.get(
  '/queue/:doctorId',
  validateObjectId('doctorId'),
  receptionController.getQueueForDoctor
);

// 4. Get patients waiting for arrival
/**
 * GET /api/reception/appointments/waiting-for-arrival
 * SECURITY: requireHospitalAccess ensures only own hospital's patients returned
 */
router.get(
  '/appointments/waiting-for-arrival',
  validateQuery(todaysAppointmentsQuerySchema),
  receptionController.getWaitingForArrival
);

// 5. Get overdue patients
/**
 * GET /api/reception/appointments/overdue
 * SECURITY: requireHospitalAccess ensures only own hospital's overdue patients returned
 */
router.get(
  '/appointments/overdue',
  receptionController.getOverduePatients
);

// ========================================================================
// WRITE OPERATIONS - Update appointment state
// ========================================================================

// 6. Verify Patient
/**
 * PATCH /api/reception/appointments/:id/verify
 * SECURITY: requireHospitalAccess ensures appointment is at own hospital
 */
router.patch(
  '/appointments/:id/verify',
  validateObjectId('id'),
  validate(verifyPatientSchema),
  receptionController.verifyPatient
);

// 7. Collect Payment
/**
 * POST /api/reception/appointments/:id/payment
 * SECURITY: requireHospitalAccess ensures appointment is at own hospital
 */
router.post(
  '/appointments/:id/payment',
  validateObjectId('id'),
  validate(collectPaymentSchema),
  receptionController.collectPayment
);

// 8. Mark Patient as Arrived (Check-in)
/**
 * PATCH /api/reception/appointments/:id/arrive
 * SECURITY: requireHospitalAccess ensures appointment is at own hospital
 */
router.patch(
  '/appointments/:id/arrive',
  validateObjectId('id'),
  receptionController.markPatientArrived
);

// 9. Mark Patient as Pending
/**
 * PATCH /api/reception/appointments/:id/pending
 * SECURITY: requireHospitalAccess ensures appointment is at own hospital
 */
router.patch(
  '/appointments/:id/pending',
  validateObjectId('id'),
  receptionController.markPatientPending
);

// 10. Update Appointment Status (Cancel or No-show)
/**
 * PATCH /api/reception/appointments/:id/status
 * SECURITY: requireHospitalAccess ensures appointment is at own hospital
 */
router.patch(
  '/appointments/:id/status',
  validateObjectId('id'),
  validate(updateStatusSchema),
  receptionController.updateAppointmentStatus
);

// 11. Move Patient to Doctor Queue
/**
 * PATCH /api/reception/appointments/:id/move-to-queue
 * SECURITY: requireHospitalAccess ensures appointment is at own hospital
 */
router.patch(
  '/appointments/:id/move-to-queue',
  validateObjectId('id'),
  receptionController.movePatientToDoctorQueue
);

// 12. Check and apply attendance timeouts (manual trigger for testing)
/**
 * POST /api/reception/appointments/check-timeouts
 * SECURITY: requireHospitalAccess ensures only own hospital's timeouts checked
 */
router.post(
  '/appointments/check-timeouts',
  receptionController.checkAttendanceTimeouts
);

module.exports = router;
