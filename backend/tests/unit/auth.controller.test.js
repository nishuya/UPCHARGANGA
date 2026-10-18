jest.mock('../../src/modules/auth/auth.service', () => ({
  refreshAccessToken: jest.fn(),
  logoutUser: jest.fn(),
}));

jest.mock('../../src/utils/cookie.util', () => ({
  getRefreshTokenCookieOptions: jest.fn(),
  clearRefreshTokenCookie: jest.fn(),
}));

const authController = require('../../src/modules/auth/auth.controller');
const authService = require('../../src/modules/auth/auth.service');
const { clearRefreshTokenCookie } = require('../../src/utils/cookie.util');
const ApiError = require('../../src/errors/ApiError');

const createResponse = () => ({
  status: jest.fn().mockReturnThis(),
  cookie: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const invokeRefresh = async (error) => {
  const req = { cookies: { refreshToken: 'refresh-token' } };
  const res = createResponse();
  const next = jest.fn();
  authService.refreshAccessToken.mockRejectedValue(error);

  authController.refreshToken(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));

  expect(next).toHaveBeenCalledWith(error);
};

describe('authController.refreshToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([401, 403])('clears the refresh cookie for invalid sessions (%i)', async (status) => {
    await invokeRefresh(new ApiError(status, 'Session is invalid.'));
    expect(clearRefreshTokenCookie).toHaveBeenCalledTimes(1);
  });

  test('preserves the refresh cookie when the server fails temporarily', async () => {
    await invokeRefresh(new ApiError(503, 'Service unavailable.'));
    expect(clearRefreshTokenCookie).not.toHaveBeenCalled();
  });

  test('accepts a refresh token in the request body for native clients', async () => {
    authService.refreshAccessToken.mockResolvedValue({
      user: { _id: 'patient-id' },
      accessToken: 'next-access-token',
      refreshToken: 'next-refresh-token',
    });
    const req = { cookies: {}, body: { refreshToken: 'refresh-token' } };
    const res = createResponse();

    authController.refreshToken(req, res, jest.fn());
    await new Promise((resolve) => setImmediate(resolve));

    expect(authService.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refreshToken: 'next-refresh-token' }),
      })
    );
  });

  test('prefers the existing refresh cookie when both transports are present', async () => {
    authService.refreshAccessToken.mockResolvedValue({
      user: { _id: 'patient-id' },
      accessToken: 'next-access-token',
      refreshToken: 'next-refresh-token',
    });
    const req = {
      cookies: { refreshToken: 'cookie-refresh-token' },
      body: { refreshToken: 'body-refresh-token' },
    };

    authController.refreshToken(req, createResponse(), jest.fn());
    await new Promise((resolve) => setImmediate(resolve));

    expect(authService.refreshAccessToken).toHaveBeenCalledWith('cookie-refresh-token');
  });
});

describe('authController.logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService.logoutUser.mockResolvedValue();
  });

  test('accepts a refresh token in the request body for native clients', async () => {
    const req = { cookies: {}, body: { refreshToken: 'native-refresh-token' } };
    const res = createResponse();

    authController.logout(req, res, jest.fn());
    await new Promise((resolve) => setImmediate(resolve));

    expect(authService.logoutUser).toHaveBeenCalledWith({
      userId: undefined,
      refreshToken: 'native-refresh-token',
    });
    expect(res.json).toHaveBeenCalled();
  });
});
