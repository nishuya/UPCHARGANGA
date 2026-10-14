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
const { USER_ROLES } = require('../constants/enums');

const extractIdString = (val) => {
  if (!val) return null;
  const id = val._id || val;
  return id.toString ? id.toString() : String(id);
};

const authorizeQueueAccess = async (req, res, next) => {
  try {
    const { doctorId, queueId } = req.params;

    let queue;
    let doctor;

    if (queueId) {
      queue = await Queue.findById(queueId);
      if (!queue) {
        return next(new ApiError(404, 'Queue not found.'));
      }
      doctor = queue.doctor;
    } else if (doctorId) {
      doctor = doctorId;
    }

    const userHospitalId = extractIdString(req.user?.hospital);
    const userAssignedDoctorId = extractIdString(req.user?.assignedDoctor);
    const targetDoctorId = extractIdString(doctor);
    const queueHospitalId = extractIdString(queue?.hospital);

    switch (req.user.role) {
      case USER_ROLES.PATIENT:
      case 'patient':
        if (req.method !== 'GET') {
          return next(
            new ApiError(403, 'Patients cannot perform queue operations.')
          );
        }
        break;

      case USER_ROLES.RECEPTIONIST:
      case 'receptionist':
        if (!userHospitalId) {
          return next(
            new ApiError(403, 'Your account is not assigned to a hospital.')
          );
        }

        if (queueHospitalId && queueHospitalId !== userHospitalId) {
          return next(
            new ApiError(403, 'Cannot access queue from another hospital.')
          );
        }
        break;

      case USER_ROLES.DOCTOR:
      case USER_ROLES.DOCTOR_ASSISTANT:
      case 'doctor':
      case 'doctor-assistant':
        if (!userHospitalId) {
          return next(
            new ApiError(403, 'Your account is not assigned to a hospital.')
          );
        }

        if (
          req.user.role === USER_ROLES.DOCTOR_ASSISTANT ||
          req.user.role === 'doctor-assistant'
        ) {
          if (userAssignedDoctorId && targetDoctorId && userAssignedDoctorId !== targetDoctorId) {
            return next(
              new ApiError(403, 'You are not assigned to this doctor.')
            );
          }
        } else if (req.user.role === USER_ROLES.DOCTOR || req.user.role === 'doctor') {
          if (
            targetDoctorId &&
            targetDoctorId !== extractIdString(req.user._id) &&
            (!userAssignedDoctorId || userAssignedDoctorId !== targetDoctorId)
          ) {
            return next(
              new ApiError(403, 'You can only access your own queue.')
            );
          }
        }

        if (queueHospitalId && queueHospitalId !== userHospitalId) {
          return next(
            new ApiError(403, 'Doctor is not in your assigned hospital.')
          );
        }
        break;

      case USER_ROLES.ADMIN:
      case 'admin':
        break;

      default:
        return next(
          new ApiError(403, 'Invalid role. Cannot determine queue access.')
        );
    }

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
