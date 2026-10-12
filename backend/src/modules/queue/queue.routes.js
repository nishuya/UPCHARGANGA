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

/**
 * GET /api/queue/:doctorId/:date
 * Retrieve current queue for a doctor on a specific date
 * Accessible to: Reception (own hospital), Doctor (assigned doctors), Patient (filtered to own)
 *
 * SECURITY: Added authorizeQueueAccess to enforce hospital and doctor assignment boundaries
 */
router.get('/:doctorId/:date', protect, authorizeQueueAccess, getQueue);

/**
 * GET /api/queue/:queueId/stats
 * Get queue statistics (waiting count, avg time, etc.)
 * Accessible to: Reception, Doctor, Admin
 *
 * SECURITY: Added authorizeQueueAccess to enforce hospital boundaries
 */
router.get('/:queueId/stats', protect, authorizeQueueAccess, getQueueStats);

// =====================================================================
// RECEPTION ENDPOINTS
// =====================================================================

/**
 * POST /api/queue/:queueId/mark-arrived/:entryId
 * Reception marks a patient as arrived
 * Accessible to: Reception (own hospital only)
 *
 * SECURITY: Added authorizeQueueAccess to prevent cross-hospital operations
 */
router.post(
  '/:queueId/mark-arrived/:entryId',
  protect,
  authorize('receptionist'),
  authorizeQueueAccess,
  markPatientArrived
);

/**
 * POST /api/queue/:queueId/skip/:entryId
 * Reception marks a patient as skipped/no-show
 * Accessible to: Reception (own hospital only)
 *
 * SECURITY: Added authorizeQueueAccess to prevent cross-hospital operations
 */
router.post(
  '/:queueId/skip/:entryId',
  protect,
  authorize('receptionist'),
  authorizeQueueAccess,
  skipPatient
);

// =====================================================================
// DOCTOR ASSISTANT ENDPOINTS
// =====================================================================

/**
 * POST /api/queue/:queueId/call-next
 * Doctor assistant calls the next patient
 * Accessible to: Doctor Assistant (assigned doctors only)
 *
 * SECURITY: Added authorizeQueueAccess to prevent operating on unassigned queues
 */
router.post(
  '/:queueId/call-next',
  protect,
  authorize('doctor', 'doctor-assistant'),
  authorizeQueueAccess,
  callNextPatient
);

/**
 * POST /api/queue/:queueId/start/:entryId
 * Doctor marks consultation as started
 * Accessible to: Doctor, Doctor Assistant (assigned doctors only)
 *
 * SECURITY: Added authorizeQueueAccess to prevent operating on unassigned queues
 */
router.post(
  '/:queueId/start/:entryId',
  protect,
  authorize('doctor', 'doctor-assistant'),
  authorizeQueueAccess,
  startConsultation
);

/**
 * POST /api/queue/:queueId/complete/:entryId
 * Doctor marks consultation as completed
 * Accessible to: Doctor, Doctor Assistant (assigned doctors only)
 *
 * SECURITY: Added authorizeQueueAccess to prevent operating on unassigned queues
 */
router.post(
  '/:queueId/complete/:entryId',
  protect,
  authorize('doctor', 'doctor-assistant'),
  authorizeQueueAccess,
  completeConsultation
);

// =====================================================================
// ADMIN ENDPOINTS
// =====================================================================

/**
 * POST /api/queue/:queueId/pause
 * Admin pauses the queue
 * Accessible to: Admin
 */
router.post(
  '/:queueId/pause',
  protect,
  authorize('admin'),
  pauseQueue
);

/**
 * POST /api/queue/:queueId/resume
 * Admin resumes the queue
 * Accessible to: Admin
 */
router.post(
  '/:queueId/resume',
  protect,
  authorize('admin'),
  resumeQueue
);

module.exports = router;
