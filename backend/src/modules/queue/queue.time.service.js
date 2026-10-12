/**
 * DEPRECATED: Queue Time Service
 *
 * This service has been consolidated into QueueScheduler.service.js
 * All time-related operations (scheduling, delays, ETAs) are now handled
 * by the centralized QueueScheduler to ensure consistency.
 *
 * DO NOT USE - kept only for reference during migration
 */

const QueueScheduler = require('./queue.scheduler.service');

console.warn(
  '[DEPRECATED] QueueTimeService is deprecated. ' +
  'All time operations should use QueueScheduler.recalculateQueue() instead.'
);

module.exports = {
  // Deprecated — redirect to QueueScheduler
  calculateScheduledSlot: (tokenNumber, consultationMinutes, dayStartTime) => {
    console.warn('[DEPRECATED] calculateScheduledSlot called — use QueueScheduler instead');
    throw new Error('QueueTimeService is deprecated. Use QueueScheduler.recalculateQueue()');
  },
};
