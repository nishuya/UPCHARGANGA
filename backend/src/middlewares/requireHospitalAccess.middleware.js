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
 * Attach hospital-scoped resource to req.resource for consistency with other authorization flows
 */
const requireHospitalAccess = async (req, res, next) => {
  try {
    // PATIENT role doesn't have hospital scope - skip this check
    if (req.user.role === 'patient') {
      return next();
    }

    // ADMIN has full access
    if (req.user.role === 'admin') {
      return next();
    }

    // RECEPTIONIST, DOCTOR, DOCTOR_ASSISTANT must have a hospital assignment
    if (!req.user.hospital) {
      return next(
        new ApiError(
          403,
          'Your account is not assigned to a hospital. Contact your administrator.'
        )
      );
    }

    // If appointment ID is in params, verify it belongs to the staff member's hospital
    if (req.params.id || req.params.appointmentId) {
      const appointmentId = req.params.id || req.params.appointmentId;

      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        // Return 404 (not found) instead of 403 to avoid information leakage
        return next(new ApiError(404, 'Appointment not found.'));
      }

      if (appointment.hospital.toString() !== req.user.hospital.toString()) {
        return next(
          new ApiError(403, 'Cannot access appointments from another hospital.')
        );
      }

      // Attach appointment to request for use in controllers
      req.appointment = appointment;
    }

    next();
  } catch (error) {
    console.error('[AUTH] Hospital access authorization error:', error);
    return next(new ApiError(500, 'Authorization check failed.'));
  }
};

module.exports = requireHospitalAccess;
