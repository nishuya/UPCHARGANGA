const ApiError = require('../errors/ApiError');

/**
 * `authorizeHospital(fieldPath)` — enforces hospital-level access control.
 * Validates that the user's hospital matches the resource's hospital field.
 *
 * Use AFTER `protect` so req.user is already populated.
 *
 * Example:
 * - router.post('/appointments', protect, authorizeHospital('body.hospital'), ...)
 *   Checks req.body.hospital === req.user.hospital
 *
 * - router.patch('/appointments/:id', protect, authorizeHospital('params.appointmentHospital'), ...)
 *   Checks populated resource hospital === req.user.hospital
 *
 * Field paths:
 * - 'body.hospital' → req.body.hospital
 * - 'params.id' → req.params.id (must be pre-populated to req.resource.hospital)
 * - 'query.hospital' → req.query.hospital
 *
 * For routes that need to fetch the resource first, populate req.resource = { hospital: ... }
 * before calling this middleware, then use fieldPath 'resource.hospital'.
 */
const authorizeHospital = (fieldPath) => (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'Not authenticated.'));
  }

  if (!req.user.hospital) {
    return next(new ApiError(403, 'User is not assigned to a hospital.'));
  }

  // Parse field path (e.g., 'body.hospital' → ['body', 'hospital'])
  const parts = fieldPath.split('.');
  let resourceHospitalId = req;

  try {
    for (const part of parts) {
      resourceHospitalId = resourceHospitalId[part];
      if (resourceHospitalId === undefined) {
        return next(new ApiError(400, `Missing required field: ${fieldPath}`));
      }
    }
  } catch (err) {
    return next(new ApiError(400, `Invalid field path: ${fieldPath}`));
  }

  // Normalize both IDs to strings for comparison (MongoDB ObjectIds)
  const userHospitalStr = req.user.hospital.toString();
  const resourceHospitalStr = resourceHospitalId.toString ? resourceHospitalId.toString() : String(resourceHospitalId);

  if (userHospitalStr !== resourceHospitalStr) {
    console.warn(
      `🔐 [AUTH] Hospital mismatch - User hospital: ${userHospitalStr}, Resource hospital: ${resourceHospitalStr}`
    );
    return next(new ApiError(403, 'You do not have access to this hospital.'));
  }

  console.log(`✅ [AUTH] Hospital authorization passed for user in hospital: ${userHospitalStr}`);
  next();
};

module.exports = authorizeHospital;
