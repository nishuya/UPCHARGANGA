/**
 * QUEUE ROUTES
 * ============
 * REST endpoints for queue operations.
 *
 * All routes require authentication and authorization checks middleware.
 * Reception, Doctor Assistant, and Admin roles have different permissions.
 */

const express = require('express');
const router = express.Router();
const {
  getQueue,
  markPatientArrived,
  callNextPatient,
  startConsultation,
  completeConsultation,
  skipPatient,
  pauseQueue,
  resumeQueue,
  getQueueStats,
} = require('./queue.controller');

const protect = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const authorizeQueueAccess = require('../../middlewares/authorizeQueueAccess.middleware');

// =====================================================================
// PUBLIC ENDPOINTS (authenticated, any role)
// =====================================================================

router.get('/:doctorId/:date', protect, authorizeQueueAccess, getQueue);

router.get('/:queueId/stats', protect, authorizeQueueAccess, getQueueStats);

// =====================================================================
// RECEPTION ENDPOINTS
// =====================================================================

router.post(
  '/:queueId/mark-arrived/:entryId',
  protect,
  authorize('receptionist'),
  authorizeQueueAccess,
  markPatientArrived
);

router.post(
  '/:queueId/skip/:entryId',
  protect,
  authorize('receptionist'),
  authorizeQueueAccess,
  skipPatient
);

// =====================================================================
// DOCTOR ASSISTANT & DOCTOR ENDPOINTS
// =====================================================================

router.post(
  '/:queueId/call-next',
  protect,
  authorize('doctor', 'doctor-assistant', 'doctorAssistant'),
  authorizeQueueAccess,
  callNextPatient
);

router.post(
  '/:queueId/start/:entryId',
  protect,
  authorize('doctor', 'doctor-assistant', 'doctorAssistant'),
  authorizeQueueAccess,
  startConsultation
);

router.post(
  '/:queueId/complete/:entryId',
  protect,
  authorize('doctor', 'doctor-assistant', 'doctorAssistant'),
  authorizeQueueAccess,
  completeConsultation
);

// =====================================================================
// ADMIN ENDPOINTS
// =====================================================================

router.post(
  '/:queueId/pause',
  protect,
  authorize('admin'),
  pauseQueue
);

router.post(
  '/:queueId/resume',
  protect,
  authorize('admin'),
  resumeQueue
);

module.exports = router;
