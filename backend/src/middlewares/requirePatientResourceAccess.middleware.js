/**
 * PATIENT RESOURCE ACCESS MIDDLEWARE
 * ==================================
 * Validates that patients can only access their own appointments and queue entries.
 *
 * Rules:
 * - PATIENT: Can only access their own appointments/entries
 * - STAFF/ADMIN: Can access any appointment (hospital check done separately)
 */

const Appointment = require('../modules/appointments/appointments.model');
const ApiError = require('../errors/ApiError');

// Populate configuration for complete appointment data
const APPOINTMENT_POPULATE = [
  {
    path: 'doctor',
    select: 'specialization consultationFee user',
    populate: { path: 'user', select: 'fullName' }
  },
  {
    path: 'hospital',
    select: 'name address contact' // Get full address and contact objects
  },
  { path: 'department', select: 'name' },
];

/**
 * Middleware to ensure patients can only access their own appointments
 * Used on routes like GET /api/patients/appointments/:id
 */
const requirePatientResourceAccess = async (req, res, next) => {
  try {
    // Only patients need this restriction; staff/admin are checked by hospital middleware
    if (req.user.role !== 'patient') {
      return next();
    }

    const appointmentId = req.params.id;

    // Patient attempting to access an appointment — fetch WITH populated data
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patient: req.user._id,
    }).populate(APPOINTMENT_POPULATE);

    if (!appointment) {
      // Return 404 (not found) instead of 403 to avoid leaking that other patients' appointments exist
      return next(new ApiError(404, 'Appointment not found.'));
    }

    // Attach appointment to request for use in controllers
    req.appointment = appointment;
    next();
  } catch (error) {
    console.error('[AUTH] Patient resource access error:', error);
    return next(new ApiError(500, 'Authorization check failed.'));
  }
};

module.exports = requirePatientResourceAccess;
