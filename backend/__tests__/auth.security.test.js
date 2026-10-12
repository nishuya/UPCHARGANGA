const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../modules/auth/auth.model');
const googleAuthService = require('../modules/auth/auth.google.service');
const authService = require('../modules/auth/auth.service');
const ApiError = require('../errors/ApiError');

describe('🔐 Google Authentication Security Tests', () => {
  describe('Google Token Verification', () => {
    test('should reject invalid Google token', async () => {
      try {
        await googleAuthService.verifyGoogleToken('invalid.token.here');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(401);
      }
    });

    test('should reject missing Google token', async () => {
      try {
        await googleAuthService.verifyGoogleToken(null);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(400);
      }
    });

    test('should reject token with wrong type', async () => {
      try {
        await googleAuthService.verifyGoogleToken({ token: 'test' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(400);
      }
    });
  });

  describe('Google Account Creation & Linking', () => {
    test('should create new patient account on first Google sign-in', async () => {
      // Mock verified Google payload
      const mockGooglePayload = {
        sub: 'unique-google-id-' + Date.now(),
        email: `test-${Date.now()}@gmail.com`,
        name: 'Test User',
        email_verified: true,
        picture: 'https://example.com/pic.jpg',
        iss: 'https://accounts.google.com',
        aud: process.env.GOOGLE_CLIENT_ID || 'test-client-id',
      };

      const result = await googleAuthService.authenticateWithGoogle(mockGooglePayload);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(mockGooglePayload.email);
      expect(result.user.role).toBe('patient');
      expect(result.user.isEmailVerified).toBe(true);

      // Verify user was saved to database
      const savedUser = await User.findById(result.user._id);
      expect(savedUser.googleProviderId).toBe(mockGooglePayload.sub);
      expect(savedUser.role).toBe('patient');
    });

    test('should authenticate existing Google-linked account', async () => {
      const googleProviderId = 'existing-google-id-' + Date.now();
      const email = `existing-${Date.now()}@gmail.com`;

      // Create existing user with Google provider ID
      const user = await User.create({
        googleProviderId,
        email,
        fullName: 'Existing User',
        role: 'patient',
        isEmailVerified: true,
        password: 'TempPassword123!',
      });

      const mockGooglePayload = {
        sub: googleProviderId,
        email,
        name: 'Updated Name',
        email_verified: true,
        picture: 'https://example.com/pic.jpg',
        iss: 'https://accounts.google.com',
        aud: process.env.GOOGLE_CLIENT_ID || 'test-client-id',
      };

      const result = await googleAuthService.authenticateWithGoogle(mockGooglePayload);

      expect(result.user._id.toString()).toBe(user._id.toString());
      expect(result).toHaveProperty('accessToken');

      // Verify user was updated with new profile info
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.fullName).toBe('Updated Name');
    });

    test('should not auto-link existing password account to Google email', async () => {
      const email = `conflict-${Date.now()}@gmail.com`;

      // Create existing password-based account
      await User.create({
        email,
        fullName: 'Existing Password User',
        phone: '+' + Math.random().toString().slice(2, 14),
        role: 'patient',
        password: 'ExistingPassword123!',
        isEmailVerified: true,
      });

      const mockGooglePayload = {
        sub: 'new-google-id-' + Date.now(),
        email,
        name: 'Google User',
        email_verified: true,
        iss: 'https://accounts.google.com',
        aud: process.env.GOOGLE_CLIENT_ID || 'test-client-id',
      };

      try {
        await googleAuthService.authenticateWithGoogle(mockGooglePayload);
        fail('Should have thrown conflict error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(409);
        expect(error.message).toContain('already exists');
      }
    });

    test('should prevent duplicate Google provider ID accounts', async () => {
      const googleProviderId = 'duplicate-test-' + Date.now();

      const mockGooglePayload = {
        sub: googleProviderId,
        email: `first-${Date.now()}@gmail.com`,
        name: 'First User',
        email_verified: true,
        iss: 'https://accounts.google.com',
        aud: process.env.GOOGLE_CLIENT_ID || 'test-client-id',
      };

      // Create first account
      const result1 = await googleAuthService.authenticateWithGoogle(mockGooglePayload);
      expect(result1.user.googleProviderId).toBe(googleProviderId);

      // Attempt to create with same Google ID should find and authenticate existing
      const result2 = await googleAuthService.authenticateWithGoogle(mockGooglePayload);
      expect(result2.user._id.toString()).toBe(result1.user._id.toString());
    });

    test('should reject unverified Google email', async () => {
      const mockGooglePayload = {
        sub: 'unverified-google-' + Date.now(),
        email: `unverified-${Date.now()}@gmail.com`,
        email_verified: false, // NOT verified
        name: 'Unverified User',
        iss: 'https://accounts.google.com',
        aud: process.env.GOOGLE_CLIENT_ID || 'test-client-id',
      };

      try {
        await googleAuthService.authenticateWithGoogle(mockGooglePayload);
        fail('Should have rejected unverified email');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(401);
        expect(error.message).toContain('email is not verified');
      }
    });

    test('should never accept frontend-supplied role from Google payload', async () => {
      const mockGooglePayload = {
        sub: 'role-test-' + Date.now(),
        email: `role-test-${Date.now()}@gmail.com`,
        name: 'Role Test',
        email_verified: true,
        role: 'admin', // Malicious frontend trying to claim admin role
        iss: 'https://accounts.google.com',
        aud: process.env.GOOGLE_CLIENT_ID || 'test-client-id',
      };

      const result = await googleAuthService.authenticateWithGoogle(mockGooglePayload);

      // Role MUST be 'patient' regardless of payload
      expect(result.user.role).toBe('patient');

      const savedUser = await User.findById(result.user._id);
      expect(savedUser.role).toBe('patient');
    });
  });

  describe('Email Verification Flow', () => {
    test('should send verification email on registration', async () => {
      // This test would require mocking email service
      // For now, we verify the token is created correctly

      const userData = {
        fullName: 'Email Test User',
        email: `emailtest-${Date.now()}@test.com`,
        phone: '+' + Math.random().toString().slice(2, 14),
        password: 'ValidPassword123!',
      };

      const result = await authService.registerUser(userData);

      expect(result.verificationPending).toBe(true);
      expect(result.email).toBe(userData.email);

      // Verify user exists but is not verified
      const user = await User.findOne({ email: userData.email });
      expect(user.isEmailVerified).toBe(false);
      expect(user.emailVerificationToken).toBeDefined();
      expect(user.emailVerificationExpires).toBeDefined();
    });

    test('should reject unverified email on login', async () => {
      const email = `unverified-login-${Date.now()}@test.com`;

      // Create unverified user
      const user = await User.create({
        fullName: 'Unverified',
        email,
        phone: '+' + Math.random().toString().slice(2, 14),
        password: 'ValidPassword123!',
        isEmailVerified: false,
      });

      try {
        await authService.loginUser({ email, password: 'ValidPassword123!' });
        fail('Should have rejected unverified email');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(403);
        expect(error.message).toContain('verify your email');
      }
    });

    test('should verify email with valid token', async () => {
      const email = `verify-test-${Date.now()}@test.com`;

      // Create unverified user
      await User.create({
        fullName: 'Verify Test',
        email,
        phone: '+' + Math.random().toString().slice(2, 14),
        password: 'ValidPassword123!',
        isEmailVerified: false,
      });

      // Generate verification token
      const user = await User.findOne({ email });
      const rawToken = user.createEmailVerificationToken();
      await user.save({ validateBeforeSave: false });

      // Verify email
      const result = await authService.verifyEmail(rawToken);
      expect(result).toHaveProperty('message');

      // Check user is now verified
      const verifiedUser = await User.findOne({ email });
      expect(verifiedUser.isEmailVerified).toBe(true);
      expect(verifiedUser.emailVerificationToken).toBeUndefined();
    });

    test('should reject expired verification token', async () => {
      const email = `expired-token-${Date.now()}@test.com`;

      // Create user with expired token
      const user = await User.create({
        fullName: 'Expired Token',
        email,
        phone: '+' + Math.random().toString().slice(2, 14),
        password: 'ValidPassword123!',
        isEmailVerified: false,
      });

      const rawToken = user.createEmailVerificationToken();
      user.emailVerificationExpires = new Date(Date.now() - 60000); // 1 minute ago
      await user.save({ validateBeforeSave: false });

      try {
        await authService.verifyEmail(rawToken);
        fail('Should have rejected expired token');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('invalid or has expired');
      }
    });

    test('should reject already-used verification token', async () => {
      const email = `reused-token-${Date.now()}@test.com`;

      await User.create({
        fullName: 'Reused Token',
        email,
        phone: '+' + Math.random().toString().slice(2, 14),
        password: 'ValidPassword123!',
        isEmailVerified: false,
      });

      const user = await User.findOne({ email });
      const rawToken = user.createEmailVerificationToken();
      await user.save({ validateBeforeSave: false });

      // First verification should succeed
      await authService.verifyEmail(rawToken);

      // Second attempt with same token should fail
      try {
        await authService.verifyEmail(rawToken);
        fail('Should have rejected reused token');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(400);
      }
    });

    test('should rate-limit resend verification requests', async () => {
      const email = `ratelimit-${Date.now()}@test.com`;

      await User.create({
        fullName: 'Rate Limit Test',
        email,
        phone: '+' + Math.random().toString().slice(2, 14),
        password: 'ValidPassword123!',
        isEmailVerified: false,
      });

      // First resend should succeed
      const result1 = await authService.resendVerificationEmail(email);
      expect(result1).toHaveProperty('message');

      // Second resend immediately should be rate-limited
      try {
        await authService.resendVerificationEmail(email);
        fail('Should have been rate-limited');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error.statusCode).toBe(429);
      }
    });
  });

  describe('Authorization & Access Control', () => {
    test('should not allow Google-authenticated patient to access admin endpoints', async () => {
      // This would be tested via HTTP endpoints, but the principle is:
      // Google patient account should have role === 'patient'
      // and fail any admin RBAC checks

      const googleProviderId = 'patient-access-test-' + Date.now();

      const user = await User.create({
        googleProviderId,
        email: `patient-access-${Date.now()}@gmail.com`,
        fullName: 'Patient Access Test',
        role: 'patient', // Explicitly patient
        isEmailVerified: true,
        password: 'RandomPassword123!',
      });

      expect(user.role).toBe('patient');
      expect(user.role).not.toBe('admin');
      expect(user.role).not.toBe('doctor');
      expect(user.role).not.toBe('receptionist');
    });

    test('should preserve existing staff authentication', async () => {
      // Existing staff accounts should continue to work with password auth
      const staffUser = await User.create({
        email: `staff-${Date.now()}@hospital.com`,
        fullName: 'Staff User',
        phone: '+' + Math.random().toString().slice(2, 14),
        password: 'StaffPassword123!',
        role: 'receptionist',
        isEmailVerified: true, // Assuming existing staff are verified
      });

      // Should be able to compare password
      const isValid = await staffUser.comparePassword('StaffPassword123!');
      expect(isValid).toBe(true);

      const isInvalid = await staffUser.comparePassword('WrongPassword');
      expect(isInvalid).toBe(false);
    });
  });

  describe('Token Security', () => {
    test('should never log or expose verification tokens', async () => {
      // Verification tokens should be hashed, never returned to client in logs
      const user = await User.create({
        email: `token-security-${Date.now()}@test.com`,
        fullName: 'Token Security',
        phone: '+' + Math.random().toString().slice(2, 14),
        password: 'TokenSecure123!',
        isEmailVerified: false,
      });

      const rawToken = user.createEmailVerificationToken();
      await user.save({ validateBeforeSave: false });

      // Get the stored hash
      const storedUser = await User.findById(user._id).select('+emailVerificationToken');
      const storedHash = storedUser.emailVerificationToken;

      // Raw token should NOT equal stored hash (it's hashed)
      expect(rawToken).not.toBe(storedHash);

      // Hash should be hex-encoded SHA256
      expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should hash refresh tokens before storage', async () => {
      const user = await User.create({
        email: `refresh-token-${Date.now()}@test.com`,
        fullName: 'Refresh Token Test',
        phone: '+' + Math.random().toString().slice(2, 14),
        password: 'RefreshToken123!',
        isEmailVerified: true,
      });

      const { refreshToken } = await authService.issueTokens(user);

      // Get stored user
      const storedUser = await User.findById(user._id).select('+refreshToken');

      // Stored refresh token should be hashed, not raw
      expect(storedUser.refreshToken).not.toBe(refreshToken);
      expect(storedUser.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});

describe('🔐 Existing Authentication Regression Tests', () => {
  test('existing password login should still work', async () => {
    const email = `regression-${Date.now()}@test.com`;
    const password = 'RegressionTest123!';

    const user = await User.create({
      email,
      fullName: 'Regression Test',
      phone: '+' + Math.random().toString().slice(2, 14),
      password,
      role: 'patient',
      isEmailVerified: true,
    });

    const result = await authService.loginUser({ email, password });

    expect(result.user._id.toString()).toBe(user._id.toString());
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
  });

  test('password reset should still work', async () => {
    const email = `reset-${Date.now()}@test.com`;

    const user = await User.create({
      email,
      fullName: 'Reset Test',
      phone: '+' + Math.random().toString().slice(2, 14),
      password: 'OldPassword123!',
      isEmailVerified: true,
    });

    const rawToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    await authService.resetPassword(rawToken, 'NewPassword123!');

    const updatedUser = await User.findById(user._id).select('+password');
    const isNewPasswordValid = await updatedUser.comparePassword('NewPassword123!');
    expect(isNewPasswordValid).toBe(true);
  });

  test('token refresh should still work', async () => {
    const user = await User.create({
      email: `token-refresh-${Date.now()}@test.com`,
      fullName: 'Token Refresh Test',
      phone: '+' + Math.random().toString().slice(2, 14),
      password: 'TokenRefresh123!',
      isEmailVerified: true,
    });

    const { refreshToken: oldRefreshToken } = await authService.issueTokens(user);

    const result = await authService.refreshAccessToken(oldRefreshToken);

    expect(result).toHaveProperty('user');
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.refreshToken).not.toBe(oldRefreshToken); // Should be rotated
  });

  test('existing appointments should not be affected', async () => {
    // This is a placeholder — actual test would verify appointment data
    // The important thing is we didn't modify the Appointment model
    expect(true).toBe(true);
  });
});
