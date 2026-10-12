const express = require('express');
const router = express.Router();

const patientController = require('./patients.controller');
const validate = require('../../middlewares/validate.middleware');
const validateObjectId = require('../../middlewares/validateObjectId.middleware');
const protect = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const requirePatientResourceAccess = require('../../middlewares/requirePatientResourceAccess.middleware');
const { USER_ROLES } = require('../../constants/enums');
const { bookAppointmentSchema, cancelAppointmentSchema } = require('./patients.validation');

/**
 * Every route here is patient-only and requires a logged-in patient.
 * (Register/Login already live in /auth — not duplicated here. Choosing
 * a City/Hospital/Department/Doctor uses the public GET endpoints already
 * exposed on /cities, /hospitals, /departments, /doctors.)
 *
 * SECURITY: All appointment endpoints are protected by:
 * 1. protect - verifies JWT token
 * 2. authorize('patient') - ensures user has patient role
 * 3. requirePatientResourceAccess - ensures patient can only access own appointments
 */
router.use(protect, authorize(USER_ROLES.PATIENT));

router.post('/appointments', validate(bookAppointmentSchema), patientController.bookAppointment);
router.get('/appointments', patientController.getMyAppointments);

/**
 * GET /api/patients/appointments/:id
 * SECURITY: Added requirePatientResourceAccess to prevent accessing other patient appointments
 */
router.get('/appointments/:id', validateObjectId('id'), requirePatientResourceAccess, patientController.getMyAppointmentById);

/**
 * GET /api/patients/appointments/:id/queue-entry
 * SECURITY: Added requirePatientResourceAccess to prevent accessing other patient queue entries
 */
router.get('/appointments/:id/queue-entry', validateObjectId('id'), requirePatientResourceAccess, patientController.getAppointmentQueueEntry);

/**
 * PATCH /api/patients/appointments/:id/cancel
 * SECURITY: Added requirePatientResourceAccess to prevent cancelling other patient appointments
 */
router.patch(
  '/appointments/:id/cancel',
  validateObjectId('id'),
  validate(cancelAppointmentSchema),
  requirePatientResourceAccess,
  patientController.cancelAppointment
);

module.exports = router;
