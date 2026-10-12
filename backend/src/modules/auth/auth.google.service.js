const { OAuth2Client } = require('google-auth-library');
const User = require('./auth.model');
const ApiError = require('../../errors/ApiError');
const config = require('../../config/env');
const { issueTokens, PUBLIC_FIELDS } = require('./auth.service');

console.log('📱 Google Auth Service loaded');
console.log('   GOOGLE_CLIENT_ID:', config.google.clientId ? '✅ SET' : '❌ NOT SET');

/**
 * Google OAuth2 client for verifying ID tokens.
 * The client is initialized once and reused for all verifications.
 */
const getGoogleClient = () => {
  if (!config.google.clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured. Check your .env file.');
  }
  return new OAuth2Client(config.google.clientId);
};

/**
 * Verifies a Google ID token and extracts the identity claims.
 *
 * @param {string} idToken - The Google ID token from the frontend
 * @returns {Promise<Object>} The verified token payload with claims
 * @throws {ApiError} If token is invalid, expired, or verification fails
 */
const verifyGoogleToken = async (idToken) => {
  if (!idToken) {
    throw new ApiError(400, 'Google ID token is required.');
  }

  if (typeof idToken !== 'string') {
    throw new ApiError(400, 'Invalid token format.');
  }

  try {
    const client = getGoogleClient();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: config.google.clientId,
    });

    const payload = ticket.getPayload();

    // Validate required claims
    if (!payload.sub) {
      throw new ApiError(401, 'Invalid Google token: missing user identifier.');
    }

    if (!payload.email) {
      throw new ApiError(401, 'Invalid Google token: missing email.');
    }

    // Verify email is marked as verified by Google
    if (payload.email_verified !== true) {
      throw new ApiError(401, 'Google account email is not verified. Please verify your email with Google first.');
    }

    // Verify issuer and audience (defense in depth)
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      throw new ApiError(401, 'Invalid token issuer.');
    }

    // Check expiration (should already be checked by verifyIdToken, but redundant check doesn't hurt)
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      throw new ApiError(401, 'Google token has expired.');
    }

    return payload;
  } catch (err) {
    // If it's already an ApiError, re-throw it
    if (err instanceof ApiError) {
      throw err;
    }

    // google-auth-library throws Error on invalid token
    if (err.message && err.message.includes('Invalid value for: audience')) {
      throw new ApiError(401, 'Invalid Google token audience.');
    }

    console.error('Google token verification error:', err.message);
    throw new ApiError(401, 'Failed to verify Google token. Please try again.');
  }
};

/**
 * Authenticates or creates a patient account using a verified Google identity.
 *
 * Flow:
 * 1. Find account already linked to this Google provider ID
 * 2. If found, authenticate it
 * 3. If not found, check if email belongs to an existing password account
 * 4. If email exists on password account, return specific error (no auto-linking)
 * 5. If neither, create a new patient account linked to Google
 * 6. Return authenticated session
 *
 * @param {Object} googlePayload - The verified Google token payload
 * @returns {Promise<Object>} { user, accessToken, refreshToken }
 * @throws {ApiError} If account linking issue or account creation fails
 */
const authenticateWithGoogle = async (googlePayload) => {
  const googleProviderId = googlePayload.sub;
  const email = googlePayload.email?.toLowerCase().trim();
  const fullName = googlePayload.name || googlePayload.email?.split('@')[0] || 'Google User';
  const profileImage = googlePayload.picture || null;

  if (!email) {
    throw new ApiError(401, 'Google account does not have an email.');
  }

  // Step 1: Look for account already linked to this Google provider ID
  let user = await User.findOne({ googleProviderId });

  if (user) {
    // Account already linked — authenticate it
    if (!user.isActive) {
      throw new ApiError(403, 'This account has been deactivated. Contact support.');
    }

    // Update profile info from Google (name, picture may have changed)
    user.fullName = fullName;
    if (profileImage && !user.profileImage) {
      user.profileImage = profileImage;
    }

    // Mark email as verified (we trust Google's email_verified flag)
    user.isEmailVerified = true;
    user.lastLoginAt = new Date();

    await user.save({ validateBeforeSave: false });

    // Issue tokens and return
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
  }

  // Step 2: Check if email already exists on another account
  const existingEmailUser = await User.findOne({ email });

  if (existingEmailUser) {
    // Email belongs to an existing account (likely password-based)
    // Do NOT auto-link or override their authentication
    // Return a specific error guiding them to use existing login
    throw new ApiError(
      409,
      'An account with this email already exists. Please sign in with your email and password instead. You can link Google later from your account settings.'
    );
  }

  // Step 3: Create new patient account linked to Google
  // Ensure role is forced to 'patient' server-side
  const newUser = await User.create({
    googleProviderId,
    email,
    fullName,
    profileImage,
    role: 'patient',
    isEmailVerified: true, // Google's email_verified is trustworthy
    // Password is not required for Google-authenticated accounts
    // They authenticate via Google OAuth, not password
    // phone is also optional for Google accounts
  });

  // Issue tokens and return
  const tokens = await issueTokens(newUser);
  const safeUser = await User.findById(newUser._id)
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

module.exports = {
  verifyGoogleToken,
  authenticateWithGoogle,
  getGoogleClient,
};
