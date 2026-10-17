jest.mock('../../src/modules/auth/auth.service', () => ({
  refreshAccessToken: jest.fn(),
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
});
