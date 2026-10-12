const User = require('./auth.model');
const ApiError = require('../../errors/ApiError');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../../utils/token.util');

/** Fields safe to send back to the client — never the password/tokens. */
const PUBLIC_FIELDS =
  '_id fullName email phone role gender dateOfBirth profileImage hospital assignedDoctor isActive isEmailVerified isPhoneVerified createdAt';

/**
 * Issues a fresh access+refresh token pair for a user, persists the HASH
 * of the new refresh token (rotation), and returns both raw tokens to the
 * caller (controller decides how to transport them: JSON body for access
 * token, httpOnly cookie for refresh token).
 *
 * Exported so Google auth service can also use it.
 */
const issueTokens = async (user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshToken = hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};

const registerUser = async (payload) => {
  const existing = await User.findOne({
    $or: [{ email: payload.email }, { phone: payload.phone }],
  });

  if (existing) {
    throw new ApiError(409, 'An account with this email or phone already exists.');
  }

  // Role is forced server-side regardless of what validation already
  // restricted — defense in depth against any future change accidentally
  // widening the Joi schema.
  const user = await User.create({ ...payload, role: 'patient', isEmailVerified: true });

  // Issue tokens immediately - no verification required
  const tokens = await issueTokens(user);
  const safeUser = await User.findById(user._id)
    .select(PUBLIC_FIELDS)
    .populate('hospital', 'name')
    .populate({
      path: 'assignedDoctor',
      select: 'user specialization',
      populate: {
        path: 'user',
        select: 'fullName'
      }
    });

  return { user: safeUser, ...tokens };
};

const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email }).select(
    '+password +loginAttempts +lockUntil'
  );

  // Intentionally identical error message whether the email doesn't exist
  // OR the password is wrong — never reveal which one failed, since that
  // lets an attacker enumerate registered emails.
  const invalidCredentialsError = new ApiError(401, 'Invalid email or password.');

  if (!user) {
    throw invalidCredentialsError;
  }

  if (user.isLocked()) {
    throw new ApiError(
      423,
      'Account temporarily locked due to too many failed login attempts. Try again later.'
    );
  }

  if (!user.isActive) {
    throw new ApiError(403, 'This account has been deactivated. Contact support.');
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    await user.registerFailedLogin();
    throw invalidCredentialsError;
  }

  await user.registerSuccessfulLogin();

  const tokens = await issueTokens(user);
  const safeUser = await User.findById(user._id)
    .select(PUBLIC_FIELDS)
    .populate('hospital', 'name')
    .populate({
      path: 'assignedDoctor',
      select: 'user specialization',
      populate: {
        path: 'user',
        select: 'fullName'
      }
    });

  return { user: safeUser, ...tokens };
};

/**
 * Refresh token rotation flow:
 * 1. Verify the JWT signature/expiry of the incoming refresh token.
 * 2. Compare its HASH against the hash stored on the user document.
 * 3. If they don't match, the stored token was already rotated (or the
 *    presented token is forged/stolen) — revoke the session entirely by
 *    clearing the stored hash, forcing a fresh login.
 * 4. If they match, issue a brand-new access+refresh pair and store the
 *    new hash (old refresh token becomes unusable immediately — rotation).
 */
const refreshAccessToken = async (incomingRefreshToken) => {
  if (!incomingRefreshToken) {
    throw new ApiError(401, 'Refresh token missing. Please log in again.');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(incomingRefreshToken);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired refresh token. Please log in again.');
  }

  const user = await User.findById(decoded.id).select('+refreshToken');

  if (!user || !user.refreshToken) {
    throw new ApiError(401, 'Session expired. Please log in again.');
  }

  if (user.refreshToken !== hashToken(incomingRefreshToken)) {
    // Possible token reuse/theft — revoke the whole session as a precaution.
    user.refreshToken = undefined;
    await user.save({ validateBeforeSave: false });
    throw new ApiError(401, 'Session invalid. Please log in again.');
  }

  const tokens = await issueTokens(user);
  const safeUser = await User.findById(user._id)
    .select(PUBLIC_FIELDS)
    .populate('hospital', 'name')
    .populate({
      path: 'assignedDoctor',
      select: 'user specialization',
      populate: {
        path: 'user',
        select: 'fullName'
      }
    });

  return { user: safeUser, ...tokens };
};

/** Clears the stored refresh token hash — invalidates the session server-side. */
const logoutUser = async (userId) => {
  await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
};

/**
 * Update patient profile information.
 * Only allows patients to update: phone, gender, dateOfBirth
 * Never allows changes to: email, password, role, or other sensitive fields
 */
const updatePatientProfile = async (userId, updateData) => {
  // Whitelist of allowed fields that patients can update
  const allowedFields = ['phone', 'gender', 'dateOfBirth'];

  // Extract only allowed fields from the update data
  const sanitizedUpdate = {};
  allowedFields.forEach(field => {
    if (field in updateData) {
      sanitizedUpdate[field] = updateData[field];
    }
  });

  // Never allow these to be updated
  if (updateData.email || updateData.password || updateData.role || updateData.googleProviderId) {
    throw new ApiError(400, 'Email, password, and role cannot be updated.');
  }

  if (Object.keys(sanitizedUpdate).length === 0) {
    throw new ApiError(400, 'No valid fields to update.');
  }

  const user = await User.findByIdAndUpdate(
    userId,
    sanitizedUpdate,
    { new: true, runValidators: true }
  ).select(PUBLIC_FIELDS)
    .populate('hospital', 'name')
    .populate({
      path: 'assignedDoctor',
      select: 'user specialization',
      populate: {
        path: 'user',
        select: 'fullName'
      }
    });

  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  return { user };
};

module.exports = {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  updatePatientProfile,
  issueTokens,
  PUBLIC_FIELDS,
};
