const ApiError = require('../errors/ApiError');

/**
 * `authorizeHospital(fieldPath)` — enforces hospital-level access control.
 * Validates that the user's hospital matches the resource's hospital field.
 *
 * Use AFTER `protect` so req.user is already populated.
 */
const authorizeHospital = (fieldPath) => (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'Not authenticated.'));
  }

  const userHospital = req.user.hospital?._id || req.user.hospital;
  if (!userHospital) {
    return next(new ApiError(403, 'User is not assigned to a hospital.'));
  }

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

  const rawResourceHospital = resourceHospitalId?._id || resourceHospitalId;
  const userHospitalStr = userHospital.toString();
  const resourceHospitalStr = rawResourceHospital?.toString
    ? rawResourceHospital.toString()
    : String(rawResourceHospital);

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
