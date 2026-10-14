/**
 * HOSPITAL STAFF ACCESS AUTHORIZATION MIDDLEWARE
 * ==============================================
 * Validates that staff (reception, doctors, etc.) can only access resources
 * in their assigned hospital.
 *
 * Rules:
 * - RECEPTIONIST: Can only access appointments at their assigned hospital
 * - DOCTOR/DOCTOR_ASSISTANT: Can only access resources at their assigned hospital
 * - ADMIN: Full access
 */

const Appointment = require('../modules/appointments/appointments.model');
const ApiError = require('../errors/ApiError');

/**
 * Middleware to ensure staff can only access resources from their assigned hospital
 */
const requireHospitalAccess = async (req, res, next) => {
  try {
    if (req.user.role === 'patient') {
      return next();
    }

    if (req.user.role === 'admin') {
      return next();
    }

    const userHospitalId = req.user.hospital?._id || req.user.hospital;

    if (!userHospitalId) {
      return next(
        new ApiError(
          403,
          'Your account is not assigned to a hospital. Contact your administrator.'
        )
      );
    }

    if (req.params.id || req.params.appointmentId) {
      const appointmentId = req.params.id || req.params.appointmentId;

      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        return next(new ApiError(404, 'Appointment not found.'));
      }

      const appointmentHospitalId = appointment.hospital?._id || appointment.hospital;

      if (appointmentHospitalId.toString() !== userHospitalId.toString()) {
        return next(
          new ApiError(403, 'Cannot access appointments from another hospital.')
        );
      }

      req.appointment = appointment;
    }

    next();
  } catch (error) {
    console.error('[AUTH] Hospital access authorization error:', error);
    return next(new ApiError(500, 'Authorization check failed.'));
  }
};

module.exports = requireHospitalAccess;
