/**
 * ATTENDANCE TIMEOUT MANAGEMENT SERVICE
 * =====================================
 * Handles the 5-minute attendance window logic.
 *
 * When a patient is added to the queue:
 * 1. Calculate attendance window: scheduled start time + 5 minutes
 * 2. Store this deadline in both Appointment and Queue entry
 * 3. When window closes AND patient hasn't arrived: apply 5-minute delay
 *
 * Idempotency: The `attendanceTimeoutApplied` flag ensures the delay is
 * applied EXACTLY ONCE, even if multiple backend instances check simultaneously.
 */

const Queue = require('./queue.model');
const Appointment = require('../appointments/appointments.model');
const QueueScheduler = require('./queue.scheduler.service');
const {
  getHospitalNow,
  normalizeDateOnly,
  combineDateAndTime,
  addMinutesToTime,
} = require('../../utils/datetime.util');
const { QUEUE_ENTRY_STATUS } = require('../../constants/enums');

class AttendanceTimeoutService {
  /**
   * Initialize attendance window when entry added to queue
   * Called during booking
   */
  static initializeAttendanceWindow(entry, appointmentDate, scheduledStartTime) {
    console.log('[ATTENDANCE] Initializing window for token', entry.tokenNumber);

    // Attendance window closes 5 minutes after scheduled start
    const windowClosesAt = addMinutesToTime(scheduledStartTime, 5);
    const windowClosesDateTime = combineDateAndTime(appointmentDate, windowClosesAt);

    entry.attendanceWindowClosesAt = windowClosesDateTime;
    entry.arrivalStatus = 'not-arrived';
    entry.attendanceTimeoutApplied = false;

    console.log('[ATTENDANCE] Window closes at:', windowClosesDateTime);
    return entry;
  }

  /**
   * Scan for appointments whose attendance windows have closed
   * Called by periodic scheduler or queue recalculation
   */
  static async checkAndApplyTimeouts(doctorId, appointmentDate, session) {
    console.log('[ATTENDANCE] Checking for attendance timeouts:', doctorId, appointmentDate);

    const queue = await Queue.findOne({ doctor: doctorId, date: appointmentDate }).session(session);
    if (!queue) {
      console.log('[ATTENDANCE] No queue found');
      return;
    }

    const now = getHospitalNow();
    let timeoutsApplied = 0;

    for (const entry of queue.entries) {
      // Skip completed/cancelled entries
      if (entry.status !== QUEUE_ENTRY_STATUS.WAITING) continue;

      // Skip if already applied
      if (entry.attendanceTimeoutApplied) continue;

      // Skip if no window set
      if (!entry.attendanceWindowClosesAt) continue;

      // Check if window has closed
      if (now >= entry.attendanceWindowClosesAt) {
        // Only apply if patient hasn't arrived
        if (entry.arrivalStatus === 'not-arrived') {
          console.log(
            '[ATTENDANCE] Timeout triggered for token',
            entry.tokenNumber,
            'at',
            now
          );

          entry.attendanceTimeoutApplied = true;
          entry.attendanceTimeoutAppliedAt = now;
          entry.delayReason = 'patient-not-arrived-5min-timeout';

          timeoutsApplied++;
        }
      }
    }

    if (timeoutsApplied > 0) {
      console.log('[ATTENDANCE] Applied', timeoutsApplied, 'timeouts, recalculating queue');
      await queue.save({ session });

      // Recalculate entire queue after applying timeouts
      await QueueScheduler.recalculateQueue(doctorId, appointmentDate, session);
    }

    return timeoutsApplied;
  }

  /**
   * Mark patient as arrived (reception action)
   * Cancels the timeout and updates appointment
   */
  static async markArrived(
    queueId,
    appointmentId,
    entryId,
    wasLate = false,
    receptionistUserId,
    session
  ) {
    console.log('[ATTENDANCE] Marking patient arrived:', {
      queue: queueId,
      appointment: appointmentId,
      wasLate,
      receptionist: receptionistUserId,
    });

    try {
      // Update queue entry
      const queue = await Queue.findById(queueId).session(session);
      if (!queue) throw new Error('Queue not found');

      const entry = queue.entries.id(entryId);
      if (!entry) throw new Error('Queue entry not found');

      const now = getHospitalNow();

      // Determine if late
      let arrivalStatus = 'arrived-on-time';
      if (wasLate || now > entry.attendanceWindowClosesAt) {
        arrivalStatus = 'arrived-late';
      }

      entry.arrivalStatus = arrivalStatus;
      entry.attendanceTimeoutApplied = true; // Mark as processed (won't apply timeout)
      entry.attendanceTimeoutAppliedAt = now;

      console.log('[ATTENDANCE] Entry marked as', arrivalStatus);

      // Update appointment
      const appointment = await Appointment.findByIdAndUpdate(
        appointmentId,
        {
          arrivedAt: now,
          attendanceMarkedBy: receptionistUserId,
          attendanceMarkedAt: now,
          status: 'checked-in',
        },
        { new: true, session }
      );

      await queue.save({ session });

      return {
        entry,
        appointment,
        arrivalStatus,
      };
    } catch (error) {
      console.error('[ATTENDANCE] Error marking arrival:', error.message);
      throw error;
    }
  }

  /**
   * Check if a patient is overdue for arrival confirmation
   * Used by UI to show "overdue" indicator
   */
  static isOverdueForArrival(entry) {
    if (!entry.attendanceWindowClosesAt) return false;
    if (entry.arrivalStatus !== 'not-arrived') return false;

    const now = getHospitalNow();
    return now >= entry.attendanceWindowClosesAt;
  }

  /**
   * Get time remaining until attendance window closes
   * Used to show countdown
   */
  static getTimeRemainingForArrival(entry) {
    if (!entry.attendanceWindowClosesAt) return null;
    if (entry.arrivalStatus !== 'not-arrived') return null;

    const now = getHospitalNow();
    const remaining = entry.attendanceWindowClosesAt.getTime() - now.getTime();

    if (remaining <= 0) return 0;

    return Math.ceil(remaining / 60000); // Return minutes
  }
}

module.exports = AttendanceTimeoutService;
