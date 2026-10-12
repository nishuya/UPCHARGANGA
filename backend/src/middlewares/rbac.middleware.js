const ApiError = require('../errors/ApiError');

/**
 * `authorize(...roles)` — role-based access control. Use AFTER `protect`
 * so req.user is already populated.
 *
 * Example: router.post('/queue/call-next', protect, authorize('doctorAssistant'), ...)
 */
const authorize = (...allowedRoles) => (req, res, next) => {
  console.log('🔑 [AUTHORIZE] Checking role:', {
    userRole: req.user?.role,
    allowedRoles,
    hasUser: !!req.user,
  });

  if (!req.user) {
    console.error('❌ [AUTHORIZE] No user');
    return next(new ApiError(401, 'Not authenticated.'));
  }

  if (!allowedRoles.includes(req.user.role)) {
    console.error('❌ [AUTHORIZE] Role mismatch - user role:', req.user.role, 'allowed:', allowedRoles);
    return next(new ApiError(403, 'You do not have permission to perform this action.'));
  }

  console.log('✅ [AUTHORIZE] Role check passed');
  next();
};

module.exports = authorize;
