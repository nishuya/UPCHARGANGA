const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Schema } = mongoose;
const { USER_ROLES, GENDER } = require('../../constants/enums');
const config = require('../../config/env');

/**
 * User Schema
 * Single collection for ALL identities (patient, receptionist, doctorAssistant,
 * doctor, admin). Handles AUTH concerns only — professional/domain data for
 * doctors lives in the separate Doctor collection (see doctors.model.js).
 */
const userSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },

    phone: {
      type: String,
      required: false, // Made optional for Google OAuth accounts
      unique: true,
      sparse: true, // Allow multiple null values
      trim: true,
      match: [/^\+?[0-9]{10,15}$/, 'Please provide a valid phone number'],
    },

    password: {
      type: String,
      required: false, // Made optional for Google OAuth accounts (they use googleProviderId instead)
      minlength: 8,
      select: false, // never returned in queries unless explicitly requested with +password
    },

    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.PATIENT,
      required: true,
      index: true,
    },

    gender: {
      type: String,
      enum: Object.values(GENDER),
    },

    dateOfBirth: {
      type: Date,
    },

    profileImage: {
      type: String,
      default: null,
    },

    address: {
      city: { type: Schema.Types.ObjectId, ref: 'City' },
      addressLine: { type: String, trim: true },
      pincode: { type: String, trim: true },
    },

    hospital: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      default: null,
      index: true,
    },

    // Only meaningful for role: 'doctorAssistant'. Ties that assistant to
    // exactly one doctor's queue within their hospital — enforced in
    // doctorAssistant.service.js so an assistant can't act on any other
    // doctor's queue even within the same hospital. Always null for every
    // other role.
    assignedDoctor: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    isPhoneVerified: {
      type: Boolean,
      default: false,
    },

    // --- Refresh token rotation ---
    // Only the HASH of the current valid refresh token is stored. On every
    // successful refresh we rotate it (new token issued, new hash stored),
    // so a stolen-but-already-used refresh token becomes worthless.
    refreshToken: {
      type: String,
      select: false,
    },

    // Server-side expiration timestamp for the active refresh-token session.
    refreshTokenExpiresAt: {
      type: Date,
      select: false,
    },

    // Bumped every time the password changes. Any access token issued
    // BEFORE this timestamp is rejected by the auth middleware, even if
    // it hasn't technically expired yet — closes the window where a leaked
    // password reset doesn't also revoke already-issued tokens.
    passwordChangedAt: {
      type: Date,
      select: false,
    },

    // --- Forgot / reset password ---
    // We store a HASH of the reset token (never the raw token that goes in
    // the email link) — identical reasoning to refresh tokens above.
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },

    // --- Brute-force protection ---
    loginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      select: false,
    },

    // --- Account setup token (one-time password setup link) ---
    // Hash of the setup token sent to new staff/doctor accounts for secure onboarding.
    // Never send the raw token in email; only the hash is stored.
    accountSetupToken: {
      type: String,
      select: false,
    },
    accountSetupExpires: {
      type: Date,
      select: false,
    },
    // Flag indicating whether this account's password has been set via the setup link.
    // Once true, the account is activated and setup tokens are no longer valid.
    isSetupComplete: {
      type: Boolean,
      default: false,
    },

    lastLoginAt: {
      type: Date,
    },

    // --- Google OAuth Integration ---
    // Google provider ID (the `sub` claim from the ID token)
    // Unique across all users but sparse (null for password-only accounts)
    googleProviderId: {
      type: String,
      sparse: true,
      index: true,
    },

    // --- Email Verification for Password Registration ---
    // Hash of the single-use verification token sent to the user's email
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },

    // Track last email verification attempt for rate limiting
    lastVerificationSentAt: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.index({ hospital: 1, role: 1 });
userSchema.index({ email: 1, googleProviderId: 1 });

// ------------------------------------------------------------------
// Hooks
// ------------------------------------------------------------------

// Hash the password whenever it's set/changed. Never store plaintext.
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, config.bcryptSaltRounds);

  // Skip on brand-new documents — passwordChangedAt is only meaningful for
  // an actual CHANGE, and setting it on creation could reject a token
  // issued in the same request/response cycle as registration due to
  // clock-precision race conditions.
  if (!this.isNew) {
    this.passwordChangedAt = new Date(Date.now() - 1000); // -1s to avoid JWT iat race
  }
});

// ------------------------------------------------------------------
// Instance methods
// ------------------------------------------------------------------

// Compares a plaintext candidate against the stored bcrypt hash.
userSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// True if the password was changed AFTER the given JWT "iat" (issued-at,
// in seconds). Used by auth middleware to reject stale tokens post-reset.
userSchema.methods.isPasswordChangedAfter = function isPasswordChangedAfter(jwtIat) {
  if (!this.passwordChangedAt) return false;
  const changedTimestamp = Math.floor(this.passwordChangedAt.getTime() / 1000);
  return jwtIat < changedTimestamp;
};

// Generates a raw reset token (sent to the user via email), stores only
// its SHA-256 hash + an expiry on the document, and returns the RAW token
// so the caller can email it. The raw token is never persisted anywhere.
userSchema.methods.createPasswordResetToken = function createPasswordResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.passwordResetExpires = new Date(
    Date.now() + config.security.passwordResetExpiryMinutes * 60 * 1000
  );

  return rawToken;
};

// Generates a cryptographically secure, unpredictable one-time setup token for
// new staff/doctor accounts. Stores only its SHA-256 hash + an expiry, and
// returns the RAW token so the caller can include it in the setup link.
// The raw token is never persisted anywhere.
userSchema.methods.createAccountSetupToken = function createAccountSetupToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');

  this.accountSetupToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.accountSetupExpires = new Date(
    Date.now() + config.security.passwordResetExpiryMinutes * 60 * 1000 // Reuse same expiry config
  );
  this.isSetupComplete = false;

  return rawToken;
};

// True if the account is currently locked out due to too many failed
// login attempts.
userSchema.methods.isLocked = function isLocked() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Called on a failed login. Increments the attempt counter and locks the
// account once the configured threshold is exceeded.
userSchema.methods.registerFailedLogin = async function registerFailedLogin() {
  // If a previous lock has already expired, start counting fresh.
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 1;
    this.lockUntil = undefined;
  } else {
    this.loginAttempts += 1;
    if (this.loginAttempts >= config.security.maxLoginAttempts) {
      this.lockUntil = new Date(Date.now() + config.security.lockTimeMinutes * 60 * 1000);
    }
  }
  await this.save({ validateBeforeSave: false });
};

// Called on a successful login — clears any failed-attempt tracking.
userSchema.methods.registerSuccessfulLogin = async function registerSuccessfulLogin() {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  this.lastLoginAt = new Date();
  await this.save({ validateBeforeSave: false });
};

// Generates a cryptographically secure, single-use email verification token.
// Stores only its SHA-256 hash + an expiry, and returns the RAW token
// so the caller can include it in the verification link.
userSchema.methods.createEmailVerificationToken = function createEmailVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');

  this.emailVerificationToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.emailVerificationExpires = new Date(
    Date.now() + (require('../../config/env').oauth?.emailVerificationExpiryMinutes || 15) * 60 * 1000
  );
  this.lastVerificationSentAt = new Date();

  return rawToken;
};

// Returns true if email verification is pending (unverified + token not expired)
userSchema.methods.isVerificationPending = function isVerificationPending() {
  return !this.isEmailVerified && this.emailVerificationExpires && this.emailVerificationExpires > Date.now();
};

module.exports = mongoose.model('User', userSchema);
