const { verifyAccessToken } = require('../utils/token.util');
const User = require('../modules/auth/auth.model');

/**
 * Like `protect`, but never rejects the request if a token is missing or
 * invalid — it just leaves req.user undefined and continues. Lets public
 * browse endpoints (e.g. GET /hospitals) and /auth/logout work gracefully
 * even when the access token is absent or expired.
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) return next();

  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id);
    if (user && user.isActive && (!user.isPasswordChangedAfter || !user.isPasswordChangedAfter(decoded.iat))) {
      req.user = user;
    }
  } catch (err) {
    // Invalid/expired token on an optional-auth route — proceed as anonymous
    // rather than throwing, since auth isn't required here.
  }

  next();
};

module.exports = optionalAuth;
