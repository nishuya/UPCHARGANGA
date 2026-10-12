/**
 * QUEUE ACCESS AUTHORIZATION MIDDLEWARE
 * =====================================
 * Validates that the user has appropriate access to queue operations.
 *
 * Rules:
 * - PATIENT: Can view queue, but only their own entry (filtering done in controller)
 * - RECEPTIONIST: Can view/modify queue only for their assigned hospital
 * - DOCTOR/DOCTOR_ASSISTANT: Can view/modify queue only for doctors they're assigned to
 * - ADMIN: Full access to all queues
 */

const Queue = require('../modules/queue/queue.model');
const ApiError = require('../errors/ApiError');

const authorizeQueueAccess = async (req, res, next) => {
  try {
    const { doctorId, queueId } = req.params;

    // For routes with :doctorId/:date, we need to resolve the doctor
    // For routes with :queueId, we need to resolve the queue
    let queue;
    let doctor;

    if (queueId) {
      // Resolve queue by ID
      queue = await Queue.findById(queueId);
      if (!queue) {
        return next(new ApiError(404, 'Queue not found.'));
      }
      doctor = queue.doctor;
    } else if (doctorId) {
      // Doctor ID provided, will need to check hospital/assignment
      doctor = doctorId;
    }

    // Role-based access control
    switch (req.user.role) {
      case 'patient':
        // Patients can view queues (but will see only their own entry - filtered in controller)
        // Patients CANNOT modify any queue operations
        if (req.method !== 'GET') {
          return next(
            new ApiError(403, 'Patients cannot perform queue operations.')
          );
        }
        break;

      case 'receptionist':
        // Receptionists can access queues only for their assigned hospital
        if (!req.user.hospital) {
          return next(
            new ApiError(403, 'Your account is not assigned to a hospital.')
          );
        }

        if (queue && queue.hospital.toString() !== req.user.hospital.toString()) {
          return next(
            new ApiError(403, 'Cannot access queue from another hospital.')
          );
        }
        break;

      case 'doctor':
      case 'doctor-assistant':
        // Doctors/assistants can access queues only for doctors they're assigned to
        if (!req.user.hospital) {
          return next(
            new ApiError(403, 'Your account is not assigned to a hospital.')
          );
        }

        // Verify the doctor is assigned to this user (schema field is assignedDoctor, singular)
        if (req.user.role === USER_ROLES.DOCTOR_ASSISTANT) {
          // Doctor assistants have exactly one assigned doctor
          if (!req.user.assignedDoctor || req.user.assignedDoctor.toString() !== doctor?.toString()) {
            return next(
              new ApiError(403, 'You are not assigned to this doctor.')
            );
          }
        } else if (req.user.role === USER_ROLES.DOCTOR) {
          // Doctors can access their own queues
          if (doctor?.toString() !== req.user._id.toString()) {
            return next(
              new ApiError(403, 'You can only access your own queue.')
            );
          }
        }

        // Verify doctor is in user's hospital
        if (queue && queue.hospital.toString() !== req.user.hospital.toString()) {
          return next(
            new ApiError(403, 'Doctor is not in your assigned hospital.')
          );
        }
        break;

      case 'admin':
        // Admin has full access
        break;

      default:
        return next(
          new ApiError(403, 'Invalid role. Cannot determine queue access.')
        );
    }

    // Attach resolved queue to request for use in controllers
    if (queue) {
      req.queue = queue;
    }

    next();
  } catch (error) {
    console.error('[AUTH] Queue access authorization error:', error);
    return next(
      new ApiError(500, 'Authorization check failed.')
    );
  }
};

module.exports = authorizeQueueAccess;
