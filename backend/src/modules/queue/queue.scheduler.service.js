/**
 * QUEUE SCHEDULER SERVICE
 * ========================
 * The SINGLE SOURCE OF TRUTH for all live queue estimate logic.
 *
 * Booked appointment timeSlot values are assigned at booking time by
 * QueueService.allocateScheduledSlot and are NOT overwritten here.
 *
 * This service recalculates estimatedConsultationStart/EndTime based on:
 *   - Doctor's configured slotDurationMinutes (never hardcoded)
 *   - Authoritative token / queue order
 *   - Actual consultation progress (start / completion)
 *   - PENDING patients past the grace period (do not block later patients)
 *   - Attendance timeouts (flagged once; overdue WAITING patients still hold position)
 *
 * GUARANTEES:
 *   1. Every actively scheduled patient receives a UNIQUE, NON-OVERLAPPING estimate
 *   2. Slots advance by the doctor's configured duration
 *   3. Attendance timeouts are applied EXACTLY ONCE (idempotent)
 *   4. Doctor delay / early completion cascades from actual timestamps
 *   5. Recalculating an unchanged queue with the same clock base is stable
 */

const Queue = require('./queue.model');
const Appointment = require('../appointments/appointments.model');
const Doctor = require('../doctors/doctors.model');
const ApiError = require('../../errors/ApiError');
const { resolveConsultationDuration } = require('../../utils/slotAllocation.util');
const {
  getHospitalNow,
  normalizeDateOnly,
  combineDateAndTime,
  addMinutesToTime,
  getWeekdayName,
} = require('../../utils/datetime.util');
const { QUEUE_ENTRY_STATUS, BOOKING_CONSTRAINTS } = require('../../constants/enums');

class QueueScheduler {
  /**
   * MAIN ENTRY POINT — recalculates and persists the entire queue for a doctor/date.
   */
  static async recalculateQueue(doctorId, appointmentDate, session) {
    console.log('[SCHEDULER] 🔄 Recalculating queue for doctor:', doctorId, 'date:', appointmentDate);

    try {
      const normalizedDate = normalizeDateOnly(appointmentDate);

      const queueQuery = Queue.findOne({ doctor: doctorId, date: normalizedDate });
      const doctorQuery = Doctor.findById(doctorId, 'availability');
      const [queue, doctor] = await Promise.all([
        session ? queueQuery.session(session) : queueQuery,
        session ? doctorQuery.session(session) : doctorQuery,
      ]);

      if (!queue) {
        console.warn('[SCHEDULER] ⚠️  No queue exists for this doctor/date yet');
        return null;
      }

      if (!doctor) {
        throw new ApiError(404, 'Doctor not found');
      }

      const daySchedule = this._getDaySchedule(doctor, normalizedDate);
      if (!daySchedule) {
        throw new ApiError(400, 'Doctor not available on this date');
      }

      const consultationMinutes = resolveConsultationDuration(daySchedule);
      console.log('[SCHEDULER] ⏱️  Consultation duration:', consultationMinutes, 'minutes');

      this._applyPendingAttendanceTimeouts(queue);

      const queueState = this._analyzeQueueState(queue);
      console.log('[SCHEDULER] 📊 Queue state:', {
        activeCount: queueState.active.length,
        deferredPendingCount: queueState.deferredPending.length,
        consultingToken: queueState.consulting?.tokenNumber,
        completedCount: queueState.completed.length,
      });

      const nextSlotStart = this._getNextAvailableSlotStart(
        queueState,
        consultationMinutes,
        normalizedDate,
        daySchedule
      );
      console.log('[SCHEDULER] ⏰ Next available slot starts at:', nextSlotStart);

      this._calculateSequentialSlots(
        queueState.active,
        nextSlotStart,
        consultationMinutes,
        normalizedDate
      );

      // PENDING patients past grace no longer block the active chain. Give them
      // a deferred estimate after the active queue so they still see a time.
      if (queueState.deferredPending.length > 0) {
        const lastActive = queueState.active[queueState.active.length - 1];
        const deferredStart = lastActive?.estimatedConsultationEndTime
          ? new Date(lastActive.estimatedConsultationEndTime.getTime())
          : new Date(nextSlotStart.getTime());

        this._calculateSequentialSlots(
          queueState.deferredPending,
          deferredStart,
          consultationMinutes,
          normalizedDate,
          queueState.active.length
        );
      }

      if (session) {
        await queue.save({ session });
      } else {
        await queue.save();
      }
      console.log('[SCHEDULER] ✅ Queue persisted successfully');

      const toSync = [...queueState.active, ...queueState.deferredPending];
      for (const entry of toSync) {
        if (entry.estimatedConsultationStartTime && entry.estimatedConsultationEndTime) {
          const updateQuery = Appointment.findByIdAndUpdate(entry.appointment, {
            estimatedConsultationStartTime: entry.estimatedConsultationStartTime,
            estimatedConsultationEndTime: entry.estimatedConsultationEndTime,
          });
          if (session) {
            await updateQuery.session(session);
          } else {
            await updateQuery;
          }
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
   * Apply 5-minute attendance timeouts exactly once per entry.
   * Does NOT auto-skip the patient — they remain WAITING and continue to
   * hold their place until reception marks pending / arrived / cancelled.
   */
  static _applyPendingAttendanceTimeouts(queue) {
    const now = getHospitalNow();
    let hasAppliedNewTimeout = false;

    for (const entry of queue.entries) {
      if (entry.status !== QUEUE_ENTRY_STATUS.WAITING) continue;
      if (entry.arrivalStatus !== 'not-arrived') continue;
      if (!entry.attendanceWindowClosesAt) continue;
      if (entry.attendanceTimeoutApplied) continue;

      if (now >= entry.attendanceWindowClosesAt) {
        console.log(
          '[SCHEDULER] ⏰ Attendance timeout flagged for token',
          entry.tokenNumber,
          '— patient still waiting (not auto-skipped)'
        );

        entry.attendanceTimeoutApplied = true;
        entry.attendanceTimeoutAppliedAt = now;
        entry.delayReason = 'patient-not-arrived-5min-timeout';
        hasAppliedNewTimeout = true;
      }
    }

    if (hasAppliedNewTimeout) {
      console.log('[SCHEDULER] 📌 Attendance timeout(s) flagged; sequential calc uses current progress');
    }
  }

  /**
   * Categorize entries.
   * - active: WAITING + CALLED + PENDING-within-grace (still block later patients)
   * - deferredPending: PENDING past grace (do not block; scheduled after active)
   * - consulting / completed: drive the schedule base
   */
  static _analyzeQueueState(queue) {
    const active = [];
    const deferredPending = [];
    let currentConsulting = null;
    const completed = [];
    const now = getHospitalNow();
    const graceMinutes = BOOKING_CONSTRAINTS.PENDING_GRACE_PERIOD_MINUTES;

    for (const entry of queue.entries) {
      if (entry.status === QUEUE_ENTRY_STATUS.IN_CONSULTATION) {
        currentConsulting = entry;
        continue;
      }

      if (
        [QUEUE_ENTRY_STATUS.COMPLETED, QUEUE_ENTRY_STATUS.SKIPPED, QUEUE_ENTRY_STATUS.NO_SHOW].includes(
          entry.status
        )
      ) {
        completed.push(entry);
        continue;
      }

      if (entry.status === QUEUE_ENTRY_STATUS.PENDING) {
        const pendingAt = entry.pendingMarkedAt ? new Date(entry.pendingMarkedAt) : null;
        const pendingMinutes = pendingAt ? (now.getTime() - pendingAt.getTime()) / 60000 : 0;
        if (pendingAt && pendingMinutes > graceMinutes) {
          deferredPending.push(entry);
        } else {
          active.push(entry);
        }
        continue;
      }

      if ([QUEUE_ENTRY_STATUS.WAITING, QUEUE_ENTRY_STATUS.CALLED].includes(entry.status)) {
        active.push(entry);
      }
    }

    active.sort((a, b) => a.tokenNumber - b.tokenNumber);
    deferredPending.sort((a, b) => a.tokenNumber - b.tokenNumber);
    completed.sort((a, b) => {
      const aEnd = a.actualEndDateTime || a.completedAt;
      const bEnd = b.actualEndDateTime || b.completedAt;
      if (!aEnd) return 1;
      if (!bEnd) return -1;
      return aEnd.getTime() - bEnd.getTime();
    });

    return {
      active,
      deferredPending,
      waiting: active,
      consulting: currentConsulting,
      completed,
    };
  }

  /**
   * Determine when the next active consultation slot should start.
   *
   * Priority:
   * 1. Current consultation: max(actualStart + duration, now) — live overrun
   * 2. Last completion: actualEnd (early finish advances the queue)
   * 3. Otherwise: doctor session start, clamped to now only when booking day is today
   *    AND the session has already opened (realistic same-day base)
   *
   * Pending delays are NOT added on top of including patients in the sequence —
   * past-grace PENDING patients are deferred out of the active chain instead.
   */
  /**
   * Map an actual progress timestamp onto the appointment calendar day.
   * Progress timestamps use hospital wall-clock stored in UTC fields; the
   * appointment date may be a future clinic day in tests/simulations.
   */
  static _progressOnAppointmentDay(progressDate, appointmentDate, isToday, now) {
    const timeStr = this._datetimeToTimeString(progressDate);
    let onDay = combineDateAndTime(appointmentDate, timeStr);
    if (isToday && onDay < now) {
      onDay = new Date(now.getTime());
    }
    return onDay;
  }

  static _getNextAvailableSlotStart(queueState, consultationMinutes, appointmentDate, daySchedule) {
    const now = getHospitalNow();
    const todayNormalized = normalizeDateOnly(now);
    const apptNormalized = normalizeDateOnly(appointmentDate);
    const isToday = apptNormalized.getTime() === todayNormalized.getTime();

    if (queueState.consulting) {
      const startedAt =
        queueState.consulting.actualStartDateTime ||
        queueState.consulting.consultationStartedAt;

      if (startedAt) {
        const startedOnDay = this._progressOnAppointmentDay(
          startedAt,
          appointmentDate,
          isToday,
          now
        );
        const estimatedEnd = new Date(startedOnDay.getTime() + consultationMinutes * 60000);
        const nextStart =
          isToday && estimatedEnd < now ? new Date(now.getTime()) : estimatedEnd;
        console.log('[SCHEDULER] 📞 Doctor currently consulting, next slot after:', nextStart);
        return nextStart;
      }
    }

    if (queueState.completed.length > 0) {
      const lastCompleted = queueState.completed[queueState.completed.length - 1];
      const endedAt = lastCompleted.actualEndDateTime || lastCompleted.completedAt;
      if (endedAt) {
        const nextStart = this._progressOnAppointmentDay(
          endedAt,
          appointmentDate,
          isToday,
          now
        );
        console.log('[SCHEDULER] ✅ Last consultation ended at:', nextStart);
        return nextStart;
      }
    }

    const scheduleStart = combineDateAndTime(appointmentDate, daySchedule.startTime);

    if (isToday && now > scheduleStart) {
      console.log('[SCHEDULER] 🕐 Session open today — base is current hospital time:', now);
      return new Date(now.getTime());
    }

    console.log('[SCHEDULER] 📅 Using doctor scheduled start:', scheduleStart);
    return scheduleStart;
  }

  /**
   * Assign sequential, non-overlapping estimates to the given entries.
   * positionOffset shifts queuePosition when assigning deferred pending patients.
   */
  static _calculateSequentialSlots(
    entries,
    nextSlotStart,
    consultationMinutes,
    appointmentDate,
    positionOffset = 0
  ) {
    const now = getHospitalNow();

    console.log('[SCHEDULER] 📋 Calculating slots for', entries.length, 'patients from', nextSlotStart);

    let currentSlotStart = new Date(nextSlotStart.getTime());

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      const slotStartTimeStr = this._datetimeToTimeString(currentSlotStart);
      const slotEndTimeStr = addMinutesToTime(slotStartTimeStr, consultationMinutes);
      const slotStartDateTime = combineDateAndTime(appointmentDate, slotStartTimeStr);
      const slotEndDateTime = combineDateAndTime(appointmentDate, slotEndTimeStr);

      entry.queuePosition = positionOffset + i + 1;
      entry.estimatedStartTime = slotStartTimeStr;
      entry.estimatedEndTime = slotEndTimeStr;
      entry.estimatedReportingTime = slotStartDateTime;
      entry.estimatedConsultationStartTime = slotStartDateTime;
      entry.estimatedConsultationEndTime = slotEndDateTime;
      entry.estimatedWaitingMinutes = Math.max(
        Math.round((slotStartDateTime.getTime() - now.getTime()) / 60000),
        0
      );

      console.log(
        `[SCHEDULER]    Patient pos ${entry.queuePosition} (token ${entry.tokenNumber}): ` +
          `${slotStartTimeStr}–${slotEndTimeStr}`
      );

      currentSlotStart = new Date(slotEndDateTime.getTime());
    }

    console.log('[SCHEDULER] ✅ Sequential slots calculated');
  }

  /**
   * Convert datetime to "HH:mm" using UTC getters.
   * Hospital "now" and combineDateAndTime both store IST wall-clock in the
   * UTC fields of the Date object — local getHours() would shift by the
   * server's real timezone and corrupt estimates.
   */
  static _datetimeToTimeString(datetime) {
    if (typeof datetime === 'string') return datetime;
    const hours = String(datetime.getUTCHours()).padStart(2, '0');
    const minutes = String(datetime.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  static _getDaySchedule(doctor, appointmentDate) {
    const dayOfWeek = getWeekdayName(appointmentDate);
    return doctor.availability?.find((slot) => slot.day === dayOfWeek) || null;
  }

  static async markPatientArrived(queueId, entryId, isLate = false, session) {
    console.log('[SCHEDULER] 👤 Marking patient arrived:', entryId, 'late:', isLate);

    const queueQuery = Queue.findById(queueId);
    const queue = session ? await queueQuery.session(session) : await queueQuery;
    if (!queue) throw new ApiError(404, 'Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new ApiError(404, 'Queue entry not found');

    entry.arrivalStatus = isLate ? 'arrived-late' : 'arrived-on-time';
    entry.attendanceTimeoutApplied = true;
    if (entry.status === QUEUE_ENTRY_STATUS.PENDING) {
      entry.status = QUEUE_ENTRY_STATUS.WAITING;
      entry.pendingMarkedAt = null;
    }

    if (session) {
      await queue.save({ session });
    } else {
      await queue.save();
    }

    console.log('[SCHEDULER] ✅ Patient marked as', entry.arrivalStatus);
    return entry;
  }

  static async recordConsultationStart(queueId, entryId, session) {
    console.log('[SCHEDULER] 🚀 Recording consultation start:', entryId);

    const queueQuery = Queue.findById(queueId);
    const queue = session ? await queueQuery.session(session) : await queueQuery;
    if (!queue) throw new ApiError(404, 'Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new ApiError(404, 'Queue entry not found');

    const now = getHospitalNow();
    entry.actualStartDateTime = now;
    entry.consultationStartedAt = now;
    entry.actualStartTime = this._datetimeToTimeString(now);
    entry.status = QUEUE_ENTRY_STATUS.IN_CONSULTATION;

    if (session) {
      await queue.save({ session });
    } else {
      await queue.save();
    }

    console.log('[SCHEDULER] ✅ Consultation started at:', entry.actualStartTime);
    return entry;
  }

  static async recordConsultationCompletion(queueId, entryId, doctorId, appointmentDate, session) {
    console.log('[SCHEDULER] ✋ Recording consultation completion:', entryId);

    const queueQuery = Queue.findById(queueId);
    const queue = session ? await queueQuery.session(session) : await queueQuery;
    if (!queue) throw new ApiError(404, 'Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new ApiError(404, 'Queue entry not found');

    const now = getHospitalNow();
    entry.actualEndDateTime = now;
    entry.actualEndTime = this._datetimeToTimeString(now);
    entry.status = QUEUE_ENTRY_STATUS.COMPLETED;
    entry.completedAt = now;

    const startedAt = entry.actualStartDateTime || entry.consultationStartedAt;
    if (startedAt) {
      const durationMs = now.getTime() - new Date(startedAt).getTime();
      entry.actualDurationMinutes = Math.round(durationMs / 60000);

      const avg = queue.averageConsultationMinutes || entry.actualDurationMinutes;
      queue.averageConsultationMinutes = Math.round(avg * 0.7 + entry.actualDurationMinutes * 0.3);
      console.log(
        '[SCHEDULER] 📊 Updated average consultation time:',
        queue.averageConsultationMinutes,
        'minutes'
      );
    }

    if (session) {
      await queue.save({ session });
    } else {
      await queue.save();
    }

    const recalculated = await this.recalculateQueue(doctorId, appointmentDate, session);
    console.log('[SCHEDULER] ✅ Queue recalculated after completion');

    return { entry, recalculatedQueue: recalculated };
  }
}

module.exports = QueueScheduler;
