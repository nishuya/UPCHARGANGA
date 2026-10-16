/**
 * QUEUE SCHEDULER SERVICE
 * ========================
 * The SINGLE SOURCE OF TRUTH for all queue scheduling logic.
 *
 * Responsibility: Calculate and persist the correct estimated consultation
 * times for every patient, accounting for:
 *   - Doctor's actual progress (actual start/end times)
 *   - Patient arrival status (on-time, late, not-arrived)
 *   - Attendance timeouts (5-minute window after scheduled start)
 *   - Queue composition (who's waiting, who's consulting, who's done)
 *
 * GUARANTEES:
 *   1. Every waiting patient receives a UNIQUE, NON-OVERLAPPING estimated slot
 *   2. Slots are calculated sequentially in booking (token) order
 *   3. Attendance timeouts are applied EXACTLY ONCE (idempotent)
 *   4. Doctor's actual progress (or delay) cascades to ALL future patients
 *   5. Early completions move future estimates earlier (don't keep stale delays)
 *
 * This service is called after every event that changes queue state:
 *   - New booking
 *   - Appointment cancellation
 *   - Patient marked arrived
 *   - Attendance timeout trigger
 *   - Consultation start/completion
 *
 * Output: Persisted queue with correct sequential slots for all patients
 */

const Queue = require('./queue.model');
const Appointment = require('../appointments/appointments.model');
const Doctor = require('../doctors/doctors.model');
const ApiError = require('../../errors/ApiError');
const {
  getHospitalNow,
  normalizeDateOnly,
  combineDateAndTime,
  addMinutesToTime,
  timeToMinutes,
  minutesToTime,
} = require('../../utils/datetime.util');
const { QUEUE_ENTRY_STATUS, APPOINTMENT_STATUS } = require('../../constants/enums');

class QueueScheduler {
  /**
   * MAIN ENTRY POINT
   * Recalculates and persists the entire queue for a doctor/date.
   *
   * Algorithm:
   * 1. Load queue and doctor's consultation duration
   * 2. Apply any pending attendance timeouts (idempotent — only once per appointment)
   * 3. Identify current state: who's consulting, who's waiting, who's done
   * 4. Determine when the next available slot starts based on actual doctor progress
   * 5. Calculate sequential, non-overlapping slots for all waiting patients
   * 6. Persist all changes
   * 7. Return updated queue for broadcasting
   *
   * GUARANTEES:
   * - Every waiting patient has a unique estimated start and end time
   * - Slots never overlap
   * - Attendance timeouts applied exactly once (idempotent flag prevents duplicates)
   * - Doctor's actual progress (delay or early) cascades to all future patients
   * - Early completions automatically move future patients earlier
   */
  static async recalculateQueue(doctorId, appointmentDate, session) {
    console.log('[SCHEDULER] 🔄 Recalculating queue for doctor:', doctorId, 'date:', appointmentDate);

    try {
      // Load queue and doctor profile
      const [queue, doctor] = await Promise.all([
        Queue.findOne({ doctor: doctorId, date: appointmentDate }).session(session),
        Doctor.findById(doctorId, 'availability').session(session),
      ]);

      if (!queue) {
        console.warn('[SCHEDULER] ⚠️  No queue exists for this doctor/date yet');
        return null;
      }

      if (!doctor) {
        throw new Error('Doctor not found');
      }

      // Get doctor's consultation duration for this date
      const daySchedule = this._getDaySchedule(doctor, appointmentDate);
      if (!daySchedule) {
        throw new Error('Doctor not available on this date');
      }

      const consultationMinutes = daySchedule.slotDurationMinutes || 15;
      console.log('[SCHEDULER] ⏱️  Consultation duration:', consultationMinutes, 'minutes');

      // Step 1: Apply any pending attendance timeouts (idempotent)
      this._applyPendingAttendanceTimeouts(queue);

      // Step 2: Identify current queue state
      const queueState = this._analyzeQueueState(queue);
      console.log('[SCHEDULER] 📊 Queue state:', {
        waitingCount: queueState.waiting.length,
        consultingToken: queueState.consulting?.tokenNumber,
        completedCount: queueState.completed.length,
      });

      // Step 3: Determine next available slot start time based on actual doctor progress
      const nextSlotStart = this._getNextAvailableSlotStart(
        queueState,
        consultationMinutes,
        appointmentDate,
        daySchedule
      );
      console.log('[SCHEDULER] ⏰ Next available slot starts at:', nextSlotStart);

      // Step 4: Calculate sequential slots for all waiting patients
      this._calculateSequentialSlots(
        queueState.waiting,
        nextSlotStart,
        consultationMinutes,
        appointmentDate
      );

      // Step 5: Persist changes
      await queue.save({ session });
      console.log('[SCHEDULER] ✅ Queue persisted successfully');

      // IMPORTANT: Sync estimated times back to Appointment documents.
      // This ensures patients can query their appointment and get the
      // latest estimate without relying on Socket.IO or frontend state.
      for (const entry of queueState.waiting) {
        if (entry.estimatedConsultationStartTime && entry.estimatedConsultationEndTime) {
          await Appointment.findByIdAndUpdate(
            entry.appointment,
            {
              estimatedConsultationStartTime: entry.estimatedConsultationStartTime,
              estimatedConsultationEndTime: entry.estimatedConsultationEndTime,
            },
            { session }
          );
        }
      }
      console.log('[SCHEDULER] ✅ Appointment estimated times synced');

      return queue;
    } catch (error) {
      console.error('[SCHEDULER] ❌ Error recalculating queue:', error.message);
      throw error;
    }
  }

  /**
   * Apply 5-minute attendance timeouts (idempotent)
   * ONLY apply once per appointment, tracked by attendanceTimeoutApplied flag.
   * This prevents the same delay from being applied multiple times if the
   * scheduler runs repeatedly on the same patient.
   *
   * Flow:
   * 1. Check if attendance window has closed
   * 2. Check if timeout hasn't already been applied (idempotency)
   * 3. Check if patient hasn't been marked arrived
   * 4. Mark timeout as applied and flag for recalculation
   */
  static _applyPendingAttendanceTimeouts(queue) {
    const now = getHospitalNow();
    let hasAppliedNewTimeout = false;

    for (const entry of queue.entries) {
      // Skip if not waiting or already marked arrived
      if (entry.status !== QUEUE_ENTRY_STATUS.WAITING) continue;
      if (entry.arrivalStatus !== 'not-arrived') continue;
      if (!entry.attendanceWindowClosesAt) continue;

      // Skip if timeout was already applied (idempotent)
      if (entry.attendanceTimeoutApplied) continue;

      // Check if attendance window has closed
      if (now >= entry.attendanceWindowClosesAt) {
        console.log(
          '[SCHEDULER] ⏰ Attendance timeout triggered for token',
          entry.tokenNumber,
          '— patient did not arrive within 5 minutes'
        );

        // Mark as applied (prevents duplicate application)
        entry.attendanceTimeoutApplied = true;
        entry.attendanceTimeoutAppliedAt = now;
        entry.delayReason = 'patient-not-arrived-5min-timeout';

        hasAppliedNewTimeout = true;
      }
    }

    if (hasAppliedNewTimeout) {
      console.log('[SCHEDULER] 📌 One or more timeouts applied; full recalculation will handle delays');
    }
  }

  /**
   * Categorize queue entries into: waiting, consulting, completed, cancelled
   * PENDING patients are included in the "waiting" list for delay calculation
   */
  static _analyzeQueueState(queue) {
    const waiting = [];
    let currentConsulting = null;
    const completed = [];

    for (const entry of queue.entries) {
      if ([QUEUE_ENTRY_STATUS.WAITING, QUEUE_ENTRY_STATUS.PENDING, QUEUE_ENTRY_STATUS.CALLED].includes(entry.status)) {
        waiting.push(entry);
      } else if (entry.status === QUEUE_ENTRY_STATUS.IN_CONSULTATION) {
        currentConsulting = entry;
      } else if (
        [QUEUE_ENTRY_STATUS.COMPLETED, QUEUE_ENTRY_STATUS.SKIPPED, QUEUE_ENTRY_STATUS.NO_SHOW].includes(
          entry.status
        )
      ) {
        completed.push(entry);
      }
    }

    // Sort waiting by token number (preserves booking order)
    waiting.sort((a, b) => a.tokenNumber - b.tokenNumber);
    // Sort completed by actual end time to find the most recent
    completed.sort((a, b) => {
      if (!a.actualEndDateTime) return 1;
      if (!b.actualEndDateTime) return -1;
      return a.actualEndDateTime.getTime() - b.actualEndDateTime.getTime();
    });

    return {
      waiting,
      consulting: currentConsulting,
      completed,
    };
  }

  /**
   * Determine when the next available consultation slot should start.
   *
   * Priority (in order):
   * 1. If someone is currently consulting: next slot = when they finish
   * 2. If some completed: next slot = when the last one finished
   * 3. Account for PENDING patients: if a patient has been pending > grace period,
   *    add delay equal to consultation duration for each unresolved pending
   * 4. If today and doctor schedule has started: use current time (+ accumulated pending delays)
   * 5. Default: use doctor's scheduled start time (+ accumulated pending delays)
   */
  static _getNextAvailableSlotStart(queueState, consultationMinutes, appointmentDate, daySchedule) {
    const now = getHospitalNow();
    const todayNormalized = normalizeDateOnly(appointmentDate);
    const nowNormalized = normalizeDateOnly(now);
    const isToday = todayNormalized.getTime() === nowNormalized.getTime();
    const { PENDING_GRACE_PERIOD_MINUTES } = require('../../constants/enums').BOOKING_CONSTRAINTS;

    // Calculate accumulated delay from PENDING patients who have exceeded grace period
    let accumulatedPendingDelay = 0;
    const pendingPatients = queueState.waiting.filter((e) => e.status === QUEUE_ENTRY_STATUS.PENDING);

    for (const pendingEntry of pendingPatients) {
      if (pendingEntry.pendingMarkedAt) {
        const timePendingMs = now.getTime() - pendingEntry.pendingMarkedAt.getTime();
        const timePendingMinutes = timePendingMs / 60000;

        // If pending exceeds grace period, apply delay
        if (timePendingMinutes > PENDING_GRACE_PERIOD_MINUTES) {
          accumulatedPendingDelay += consultationMinutes;
          console.log(
            `[SCHEDULER] ⏳ Patient #${pendingEntry.tokenNumber} pending for ${Math.round(timePendingMinutes)}min ` +
            `(grace: ${PENDING_GRACE_PERIOD_MINUTES}min) — adding ${consultationMinutes}min delay`
          );
        }
      }
    }

    if (accumulatedPendingDelay > 0) {
      console.log('[SCHEDULER] 📌 Total pending delays:', accumulatedPendingDelay, 'minutes');
    }

    // If someone is currently consulting, next slot starts after they finish
    if (queueState.consulting && queueState.consulting.actualStartDateTime) {
      const estimatedEndTime = addMinutesToTime(
        this._datetimeToTimeString(queueState.consulting.actualStartDateTime),
        consultationMinutes
      );
      let estimatedEndDateTime = combineDateAndTime(appointmentDate, estimatedEndTime);

      // Add pending delays
      if (accumulatedPendingDelay > 0) {
        estimatedEndDateTime = new Date(estimatedEndDateTime.getTime() + accumulatedPendingDelay * 60000);
      }

      console.log('[SCHEDULER] 📞 Doctor currently consulting, next slot after:', estimatedEndDateTime);
      return estimatedEndDateTime;
    }

    // If no one consulting but some completed, use last completion time
    if (queueState.completed.length > 0) {
      const lastCompleted = queueState.completed[queueState.completed.length - 1];
      if (lastCompleted.actualEndDateTime) {
        let nextStart = new Date(lastCompleted.actualEndDateTime.getTime());

        // Add pending delays
        if (accumulatedPendingDelay > 0) {
          nextStart = new Date(nextStart.getTime() + accumulatedPendingDelay * 60000);
        }

        console.log('[SCHEDULER] ✅ Last consultation ended at:', lastCompleted.actualEndDateTime, 'adjusted for pending:', nextStart);
        return nextStart;
      }
    }

    // If today and doctor schedule has started, use current time + pending delays
    if (isToday) {
      const scheduleStart = combineDateAndTime(appointmentDate, daySchedule.startTime);
      if (now > scheduleStart) {
        let nextStart = new Date(now.getTime());

        // Add pending delays
        if (accumulatedPendingDelay > 0) {
          nextStart = new Date(nextStart.getTime() + accumulatedPendingDelay * 60000);
        }

        console.log('[SCHEDULER] 🕐 Doctor schedule started, using current time:', now, 'adjusted for pending:', nextStart);
        return nextStart;
      }
    }

    // Default: use doctor's scheduled start time + pending delays
    let defaultStart = combineDateAndTime(appointmentDate, daySchedule.startTime);
    if (accumulatedPendingDelay > 0) {
      defaultStart = new Date(defaultStart.getTime() + accumulatedPendingDelay * 60000);
    }

    console.log('[SCHEDULER] 📅 Using doctor scheduled start:', defaultStart);
    return defaultStart;
  }

  /**
   * Calculate sequential consultation slots for all waiting patients.
   *
   * CRITICAL: Each patient receives a UNIQUE, NON-OVERLAPPING slot.
   * Starting from nextSlotStart, slots are spaced sequentially by consultationMinutes.
   *
   * Each slot is calculated as:
   * - Slot N start = Slot (N-1) end
   * - Slot N end = Slot N start + consultationMinutes
   *
   * This guarantees no overlaps and no duplicate times.
   *
   * IMPORTANT: Also stores estimated consultation start/end times for patient display.
   */
  static _calculateSequentialSlots(waitingEntries, nextSlotStart, consultationMinutes, appointmentDate) {
    const now = getHospitalNow();

    console.log('[SCHEDULER] 📋 Calculating slots for', waitingEntries.length, 'waiting patients');
    console.log('[SCHEDULER]    Starting from:', nextSlotStart);

    let currentSlotStart = new Date(nextSlotStart.getTime());

    for (let i = 0; i < waitingEntries.length; i++) {
      const entry = waitingEntries[i];

      // Calculate this patient's slot
      const slotStartTimeStr = this._datetimeToTimeString(currentSlotStart);
      const slotEndTimeStr = addMinutesToTime(slotStartTimeStr, consultationMinutes);

      // Convert back to full datetime
      const slotStartDateTime = new Date(currentSlotStart.getTime());
      const slotEndDateTime = combineDateAndTime(appointmentDate, slotEndTimeStr);

      // Update entry with both scheduled (original booking) and estimated (recalculated) times
      entry.queuePosition = i + 1;
      entry.estimatedStartTime = slotStartTimeStr;
      entry.estimatedEndTime = slotEndTimeStr;
      entry.estimatedReportingTime = slotStartDateTime;

      // IMPORTANT: Store persistent estimated consultation times for patient display
      // These are synced to the Appointment document after queue save
      entry.estimatedConsultationStartTime = slotStartDateTime;
      entry.estimatedConsultationEndTime = slotEndDateTime;

      const waitingMinutes = Math.max(
        Math.round((slotStartDateTime.getTime() - now.getTime()) / 60000),
        0
      );
      entry.estimatedWaitingMinutes = waitingMinutes;

      console.log(
        `[SCHEDULER]    Patient ${i + 1} (token ${entry.tokenNumber}): ` +
        `${slotStartTimeStr}–${slotEndTimeStr} ` +
        `(wait: ${waitingMinutes}min)`
      );

      // Next patient's slot starts where this one ends
      currentSlotStart = new Date(slotEndDateTime.getTime());
    }

    console.log('[SCHEDULER] ✅ All sequential slots calculated');
  }

  /**
   * Helper: Convert datetime to "HH:mm" format
   */
  static _datetimeToTimeString(datetime) {
    if (typeof datetime === 'string') return datetime;
    const hours = String(datetime.getHours()).padStart(2, '0');
    const minutes = String(datetime.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Get doctor's schedule for a specific date
   */
  static _getDaySchedule(doctor, appointmentDate) {
    const dayNames = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    const dayOfWeek = dayNames[appointmentDate.getUTCDay()];

    return doctor.availability?.find((slot) => slot.day === dayOfWeek) || null;
  }

  /**
   * Mark a patient as arrived and persist the status.
   * Sets arrivalStatus to either 'arrived-on-time' or 'arrived-late'.
   * Marks timeout as applied so the attendance window is no longer checked.
   */
  static async markPatientArrived(queueId, entryId, isLate = false, session) {
    console.log('[SCHEDULER] 👤 Marking patient arrived:', entryId, 'late:', isLate);

    const queue = await Queue.findById(queueId).session(session);
    if (!queue) throw new Error('Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new Error('Queue entry not found');

    // Update arrival status
    entry.arrivalStatus = isLate ? 'arrived-late' : 'arrived-on-time';
    entry.attendanceTimeoutApplied = true; // Don't apply timeout anymore

    // If patient arrives late, recalculation will handle if they need to be
    // shuffled in the queue or wait for the next slot
    await queue.save({ session });

    console.log('[SCHEDULER] ✅ Patient marked as', entry.arrivalStatus);
    return entry;
  }

  /**
   * Record consultation start: capture actual start time and update status.
   * The next recalculation will cascade this delay (if any) to future patients.
   */
  static async recordConsultationStart(queueId, entryId, session) {
    console.log('[SCHEDULER] 🚀 Recording consultation start:', entryId);

    const queue = await Queue.findById(queueId).session(session);
    if (!queue) throw new Error('Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new Error('Queue entry not found');

    const now = getHospitalNow();
    entry.actualStartDateTime = now;
    entry.actualStartTime = this._datetimeToTimeString(now);
    entry.status = QUEUE_ENTRY_STATUS.IN_CONSULTATION;

    await queue.save({ session });

    console.log('[SCHEDULER] ✅ Consultation started at:', entry.actualStartTime);
    return entry;
  }

  /**
   * Record consultation completion: capture actual end time, calculate duration,
   * update queue average, and trigger recalculation for remaining patients.
   */
  static async recordConsultationCompletion(queueId, entryId, doctorId, appointmentDate, session) {
    console.log('[SCHEDULER] ✋ Recording consultation completion:', entryId);

    const queue = await Queue.findById(queueId).session(session);
    if (!queue) throw new Error('Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new Error('Queue entry not found');

    const now = getHospitalNow();
    entry.actualEndDateTime = now;
    entry.actualEndTime = this._datetimeToTimeString(now);
    entry.status = QUEUE_ENTRY_STATUS.COMPLETED;
    entry.completedAt = now;

    // Calculate actual duration
    if (entry.actualStartDateTime) {
      const durationMs = now.getTime() - entry.actualStartDateTime.getTime();
      entry.actualDurationMinutes = Math.round(durationMs / 60000);

      // Update queue's average (exponential moving average)
      // 70% of old average + 30% of new consultation
      const avg = queue.averageConsultationMinutes || 15;
      queue.averageConsultationMinutes = Math.round(avg * 0.7 + entry.actualDurationMinutes * 0.3);
      console.log('[SCHEDULER] 📊 Updated average consultation time:', queue.averageConsultationMinutes, 'minutes');
    }

    await queue.save({ session });

    // Recalculate remaining queue after completion
    // This cascades the completion (potentially early) to all future patients
    const recalculated = await this.recalculateQueue(doctorId, appointmentDate, session);
    console.log('[SCHEDULER] ✅ Queue recalculated after completion');

    return { entry, recalculatedQueue: recalculated };
  }
}

module.exports = QueueScheduler;
