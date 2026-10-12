const express = require('express');
const router = express.Router();

const doctorController = require('./doctors.controller');
const validate = require('../../middlewares/validate.middleware');
const validateObjectId = require('../../middlewares/validateObjectId.middleware');
const parseFormData = require('../../middlewares/parseFormData.middleware');
const protect = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const optionalAuth = require('../../middlewares/optionalAuth.middleware');
const { uploadSingle, handleMulterError } = require('../../middlewares/upload.middleware');
const { USER_ROLES } = require('../../constants/enums');
const {
  createDoctorSchema,
  updateDoctorSchema,
  assignHospitalSchema,
  assignDepartmentSchema,
  createUnavailabilitySchema,
  updateUnavailabilitySchema,
} = require('./doctors.validation');

// Public browse — patients need to see doctors to book appointments.
router.get('/', optionalAuth, doctorController.getDoctors);
router.get('/:id', validateObjectId('id'), optionalAuth, doctorController.getDoctorById);

// Everything below is admin-only.
router.use(protect, authorize(USER_ROLES.ADMIN));

router.post(
  '/',
  uploadSingle('image'),
  handleMulterError,
  parseFormData,
  validate(createDoctorSchema),
  doctorController.createDoctor
);

router.patch(
  '/:id',
  validateObjectId('id'),
  uploadSingle('image'),
  handleMulterError,
  parseFormData,
  validate(updateDoctorSchema),
  doctorController.updateDoctor
);

router.patch(
  '/:id/assign-hospital',
  validateObjectId('id'),
  validate(assignHospitalSchema),
  doctorController.assignHospital
);

router.patch(
  '/:id/assign-department',
  validateObjectId('id'),
  validate(assignDepartmentSchema),
  doctorController.assignDepartment
);

router.delete('/:id', validateObjectId('id'), doctorController.deleteDoctor);

// Doctor Unavailability Routes (all protected by router.use above)
// POST /doctors/:id/unavailability - create unavailability period
router.post(
  '/:id/unavailability',
  validateObjectId('id'),
  validate(createUnavailabilitySchema),
  doctorController.createUnavailability
);

// GET /doctors/:id/unavailability - list all unavailability periods for a doctor
router.get(
  '/:id/unavailability',
  validateObjectId('id'),
  doctorController.getUnavailability
);

// PATCH /doctors/:id/unavailability/:unavailabilityId - update unavailability period
router.patch(
  '/:id/unavailability/:unavailabilityId',
  validateObjectId('id'),
  validateObjectId('unavailabilityId'),
  validate(updateUnavailabilitySchema),
  doctorController.updateUnavailability
);

// DELETE /doctors/:id/unavailability/:unavailabilityId - delete unavailability period
router.delete(
  '/:id/unavailability/:unavailabilityId',
  validateObjectId('id'),
  validateObjectId('unavailabilityId'),
  doctorController.deleteUnavailability
);

module.exports = router;
