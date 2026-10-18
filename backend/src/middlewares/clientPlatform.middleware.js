const CLIENT_PLATFORMS = new Set(['mobile', 'web']);

const identifyClientPlatform = (req, res, next) => {
  const headerValue = req.get('X-Client-Platform');
  const normalizedValue = typeof headerValue === 'string' ? headerValue.trim().toLowerCase() : '';
  const clientPlatform = CLIENT_PLATFORMS.has(normalizedValue) ? normalizedValue : 'unknown';

  req.clientPlatform = clientPlatform;
  res.locals.clientPlatform = clientPlatform;
  next();
};

module.exports = identifyClientPlatform;
