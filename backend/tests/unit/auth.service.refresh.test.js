jest.mock('../../src/modules/auth/auth.model', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

const User = require('../../src/modules/auth/auth.model');
const authService = require('../../src/modules/auth/auth.service');
const { generateRefreshToken, hashToken } = require('../../src/utils/token.util');

const createQuery = (value) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

describe('refresh token rotation concurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not revoke the winning session when refreshes race', async () => {
    const userId = '65a000000000000000000001';
    const incomingRefreshToken = generateRefreshToken({ _id: userId });
    const user = {
      _id: userId,
      refreshToken: hashToken(incomingRefreshToken),
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
      isActive: true,
      isPasswordChangedAfter: jest.fn(() => false),
      save: jest.fn(),
    };

    User.findById.mockImplementation(() => createQuery(user));
    User.findOneAndUpdate
      .mockResolvedValueOnce({ _id: userId })
      .mockResolvedValueOnce(null);

    const results = await Promise.allSettled([
      authService.refreshAccessToken(incomingRefreshToken),
      authService.refreshAccessToken(incomingRefreshToken),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(({ status }) => status === 'rejected');
    expect(rejected.reason.statusCode).toBe(409);
    expect(User.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(user.save).not.toHaveBeenCalled();
  });
});
