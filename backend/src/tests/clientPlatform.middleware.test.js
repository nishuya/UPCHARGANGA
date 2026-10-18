const identifyClientPlatform = require('../middlewares/clientPlatform.middleware');

const runMiddleware = (headerValue) => {
  const req = {
    get: jest.fn(() => headerValue),
  };
  const res = { locals: {} };
  const next = jest.fn();

  identifyClientPlatform(req, res, next);

  return { req, res, next };
};

describe('client platform identification middleware', () => {
  it.each([
    ['mobile', 'mobile'],
    ['web', 'web'],
    [' MOBILE ', 'mobile'],
    [undefined, 'unknown'],
    ['desktop', 'unknown'],
    ['', 'unknown'],
  ])('identifies header %s as %s', (headerValue, expectedPlatform) => {
    const { req, res, next } = runMiddleware(headerValue);

    expect(req.clientPlatform).toBe(expectedPlatform);
    expect(res.locals.clientPlatform).toBe(expectedPlatform);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
