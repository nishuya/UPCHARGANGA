/**
 * QUEUE SCHEDULER SERVICE
 * ========================
 * The SINGLE AUTHORITATIVE SOURCE OF TRUTH for all queue estimation,
 * late/fast/delayed classification, and sequential slot calculation.
 */

const Queue = require('./queue.model');
const Appointment = require('../appointments/appointments.model');
const Doctor = require('../doctors/doctors.model');
const {
  getHospitalNow,
  normalizeDateOnly,
  combineDateAndTime,
  addMinutesToTime,
  datetimeToTimeString,
  formatTime12h,
  isSameUTCDate,
  isMockNowActive,
} = require('../../utils/datetime.util');
const {
  QUEUE_ENTRY_STATUS,
  APPOINTMENT_STATUS,
  BOOKING_CONSTRAINTS,
} = require('../../constants/enums');

const EARLY_REPORTING_BUFFER_MINUTES = 10;

class QueueScheduler {
  /**
   * Authoritative recalculation of a single (doctor, date) queue.
   * Deterministic, idempotent, and safe to call repeatedly.
   * Never accumulates delays across repeated runs at the same clock state.
   */
  static async recalculateQueue(doctorId, appointmentDate, session, options = {}) {
    const normalizedDate = normalizeDateOnly(appointmentDate);
    const now = options.now ? new Date(options.now) : getHospitalNow();

    const queueQuery = Queue.findOne({ doctor: doctorId, date: normalizedDate });
    const doctorQuery = Doctor.findById(doctorId, 'availability isAvailableToday unavailability');

    const [queue, doctor] = await Promise.all([
      session ? queueQuery.session(session) : queueQuery,
      session ? doctorQuery.session(session) : doctorQuery,
    ]);

    if (!queue) {
      return null;
    }

    const daySchedule = doctor ? this._getDaySchedule(doctor, normalizedDate) : null;

    // Authoritative consultation duration:
    // 1. Explicit queue override (configuredConsultationMinutes) if set
    // 2. Doctor's configured daySchedule.slotDurationMinutes
    // 3. Queue's seeded averageConsultationMinutes
    const consultationMinutes = Number(
      queue.configuredConsultationMinutes ||
        daySchedule?.slotDurationMinutes ||
        queue.averageConsultationMinutes ||
        15
    );
    queue.averageConsultationMinutes = consultationMinutes;

    const sessionStartStr = daySchedule?.startTime || '09:00';
    const sessionEndStr =
      daySchedule?.endTime && daySchedule.endTime !== '00:00' ? daySchedule.endTime : '23:59';
    const sessionStart = combineDateAndTime(normalizedDate, sessionStartStr);
    const sessionEnd = combineDateAndTime(normalizedDate, sessionEndStr);

    // Load all linked appointments in one query to ensure status and arrival consistency
    const appointmentIds = queue.entries.map((e) => e.appointment).filter(Boolean);
    let appointments = [];
    if (appointmentIds.length > 0) {
      const aptQuery = Appointment.find(
        { _id: { $in: appointmentIds } },
        'timeSlot status isActive arrivedAt cancellationReason actualConsultationStartedAt actualConsultationCompletedAt'
      );
      appointments = await (session ? aptQuery.session(session) : aptQuery).lean();
    }
    const appointmentById = new Map(appointments.map((a) => [a._id.toString(), a]));

    // Reconcile each entry's baseline slot and status with its Appointment record
    for (const entry of queue.entries) {
      const apt = appointmentById.get(entry.appointment?.toString());

      if (!entry.scheduledStartTime) {
        entry.scheduledStartTime =
          apt?.timeSlot?.start ||
          addMinutesToTime(sessionStartStr, (entry.tokenNumber - 1) * consultationMinutes);
      }
      if (!entry.scheduledEndTime) {
        entry.scheduledEndTime =
          apt?.timeSlot?.end || addMinutesToTime(entry.scheduledStartTime, consultationMinutes);
      }

      if (!entry.initialEstimatedStartTime) {
        entry.initialEstimatedStartTime = combineDateAndTime(
          normalizedDate,
          entry.scheduledStartTime
        );
      }
      if (!entry.initialEstimatedEndTime) {
        entry.initialEstimatedEndTime = combineDateAndTime(normalizedDate, entry.scheduledEndTime);
      }

      if (!entry.attendanceWindowClosesAt) {
        const graceMins = BOOKING_CONSTRAINTS.PENDING_GRACE_PERIOD_MINUTES || 5;
        entry.attendanceWindowClosesAt = new Date(
          entry.initialEstimatedStartTime.getTime() + graceMins * 60000
        );
      }

      if (apt) {
        if (apt.status === APPOINTMENT_STATUS.CANCELLED || apt.isActive === false) {
          entry.status = QUEUE_ENTRY_STATUS.SKIPPED;
          entry.delayReason =
            apt.cancellationReason === 'DOCTOR_UNAVAILABLE' ? 'doctor-unavailable' : 'cancelled';
        } else if (
          apt.status === APPOINTMENT_STATUS.NO_SHOW ||
          apt.status === APPOINTMENT_STATUS.EXPIRED
        ) {
          entry.status = QUEUE_ENTRY_STATUS.NO_SHOW;
        } else if (
          apt.status === APPOINTMENT_STATUS.COMPLETED &&
          entry.status !== QUEUE_ENTRY_STATUS.COMPLETED
        ) {
          entry.status = QUEUE_ENTRY_STATUS.COMPLETED;
          entry.completedAt = entry.completedAt || apt.actualConsultationCompletedAt || now;
          entry.actualEndDateTime = entry.actualEndDateTime || entry.completedAt;
          entry.actualEndTime = datetimeToTimeString(entry.actualEndDateTime);
        } else if (
          apt.status === APPOINTMENT_STATUS.IN_CONSULTATION &&
          entry.status !== QUEUE_ENTRY_STATUS.IN_CONSULTATION
        ) {
          entry.status = QUEUE_ENTRY_STATUS.IN_CONSULTATION;
          entry.consultationStartedAt =
            entry.consultationStartedAt || apt.actualConsultationStartedAt || now;
          entry.actualStartDateTime = entry.actualStartDateTime || entry.consultationStartedAt;
          entry.actualStartTime = datetimeToTimeString(entry.actualStartDateTime);
        }

        if (apt.arrivedAt && entry.arrivalStatus === 'not-arrived') {
          entry.checkedInAt = entry.checkedInAt || apt.arrivedAt;
          entry.arrivalStatus =
            entry.attendanceWindowClosesAt && apt.arrivedAt > entry.attendanceWindowClosesAt
              ? 'arrived-late'
              : 'arrived-on-time';
          entry.attendanceTimeoutApplied = true;
        }
      }
    }

    // Step 1: Apply pending attendance timeouts idempotently
    this._applyPendingAttendanceTimeouts(queue, now);

    // Step 2: Partition entries into consulting, active waiting, completed, and inactive (pending/skipped/cancelled)
    const queueState = this._analyzeQueueState(queue, appointmentById);

    // Step 3: Determine whether live wall-clock progression applies
    const isToday = isSameUTCDate(normalizedDate, now);
    const shouldUseLiveClock =
      Boolean(options.now) ||
      isMockNowActive()
        ? isToday
        : isToday && now >= sessionStart && now <= sessionEnd;

    // Step 4: Determine the next available consultation start time from authoritative timestamps
    const nextSlotStart = this._getNextAvailableSlotStart({
      queueState,
      consultationMinutes,
      sessionStart,
      now,
      shouldUseLiveClock,
    });

    // Step 5: Update active consulting entry if present
    if (queueState.consulting) {
      const cEntry = queueState.consulting;
      const cStart =
        cEntry.actualStartDateTime || cEntry.consultationStartedAt || sessionStart;
      cEntry.actualStartDateTime = cStart;
      cEntry.consultationStartedAt = cStart;
      cEntry.actualStartTime = datetimeToTimeString(cStart);

      const expectedEnd = new Date(cStart.getTime() + consultationMinutes * 60000);
      const effectiveEnd =
        shouldUseLiveClock && now.getTime() > expectedEnd.getTime()
          ? new Date(now.getTime())
          : expectedEnd;

      cEntry.queuePosition = 0;
      cEntry.estimatedConsultationStartTime = cStart;
      cEntry.estimatedConsultationEndTime = effectiveEnd;
      cEntry.estimatedReportingTime = cStart;
      cEntry.estimatedStartTime = datetimeToTimeString(cStart);
      cEntry.estimatedEndTime = datetimeToTimeString(effectiveEnd);
      cEntry.estimatedWaitingMinutes = 0;
      cEntry.recommendedArrivalTime = cStart;
      cEntry.timingStatus = 'in-consultation';
      cEntry.delayMinutes = Math.max(
        0,
        Math.round((effectiveEnd.getTime() - expectedEnd.getTime()) / 60000)
      );
      cEntry.aheadMinutes = 0;
      cEntry.statusLabel = 'In Consultation';
      cEntry.statusMessage =
        cEntry.delayMinutes > 0
          ? `Consultation in progress (+${cEntry.delayMinutes} min beyond standard slot).`
          : 'Your consultation with the doctor is currently in progress.';
      cEntry.recommendedAction = 'Currently in consultation with the doctor.';
      cEntry.lastUpdatedAt = now;
    }

    // Step 6: Calculate sequential slots and timing classification for all active waiting entries
    const lastCompleted =
      queueState.completed.length > 0
        ? queueState.completed[queueState.completed.length - 1]
        : null;
    const lastCompletedEnd = lastCompleted
      ? lastCompleted.actualEndDateTime || lastCompleted.completedAt
      : null;

    this._calculateSequentialSlots({
      waitingEntries: queueState.waiting,
      nextSlotStart,
      consultationMinutes,
      normalizedDate,
      sessionStart,
      now,
      shouldUseLiveClock,
      hasActiveConsultation: Boolean(queueState.consulting),
      lastCompletedEnd,
      appointmentById,
    });

    // Step 7: Update completed and inactive/pending/skipped entries without rewriting actual history
    for (const cEntry of queueState.completed) {
      cEntry.queuePosition = null;
      cEntry.estimatedWaitingMinutes = 0;
      cEntry.timingStatus = 'completed';
      cEntry.delayMinutes = 0;
      cEntry.aheadMinutes = 0;
      cEntry.statusLabel = 'Completed';
      cEntry.statusMessage = 'Consultation completed.';
      cEntry.recommendedAction = null;
      cEntry.lastUpdatedAt = cEntry.completedAt || cEntry.actualEndDateTime || now;
    }

    for (const pEntry of queueState.inactive) {
      const apt = appointmentById.get(pEntry.appointment?.toString());
      pEntry.queuePosition = null;
      pEntry.estimatedConsultationStartTime = null;
      pEntry.estimatedConsultationEndTime = null;
      pEntry.estimatedReportingTime = null;
      pEntry.estimatedStartTime = null;
      pEntry.estimatedEndTime = null;
      pEntry.estimatedWaitingMinutes = null;
      pEntry.recommendedArrivalTime = null;
      pEntry.delayMinutes = 0;
      pEntry.aheadMinutes = 0;
      pEntry.lastUpdatedAt = now;

      if (
        pEntry.delayReason === 'doctor-unavailable' ||
        apt?.cancellationReason === 'DOCTOR_UNAVAILABLE'
      ) {
        pEntry.timingStatus = 'doctor-unavailable';
        pEntry.statusLabel = 'Doctor Unavailable';
        pEntry.statusMessage =
          'This session cannot proceed because the doctor is unavailable.';
        pEntry.recommendedAction =
          'Your appointment was cancelled due to doctor unavailability. Please book another slot.';
      } else if (
        pEntry.delayReason === 'cancelled' ||
        apt?.status === APPOINTMENT_STATUS.CANCELLED
      ) {
        pEntry.timingStatus = 'cancelled';
        pEntry.statusLabel = 'Cancelled';
        pEntry.statusMessage = 'This booking has been cancelled and removed from the active queue.';
        pEntry.recommendedAction = null;
      } else if (
        pEntry.status === QUEUE_ENTRY_STATUS.NO_SHOW ||
        apt?.status === APPOINTMENT_STATUS.NO_SHOW ||
        apt?.status === APPOINTMENT_STATUS.EXPIRED
      ) {
        pEntry.timingStatus = 'no-show';
        pEntry.statusLabel = 'No Show';
        pEntry.statusMessage = 'Marked as no-show and removed from the active queue.';
        pEntry.recommendedAction = 'Please contact reception if you require assistance.';
      } else {
        // PENDING or SKIPPED (moved out of active scheduled sequence by reception/staff)
        pEntry.timingStatus = 'pending-skip';
        pEntry.statusLabel =
          pEntry.status === QUEUE_ENTRY_STATUS.PENDING
            ? 'Pending — Marked Absent'
            : 'Skipped — Out of Sequence';
        pEntry.statusMessage =
          'You missed your turn and were moved out of the current scheduled sequence.';
        pEntry.recommendedAction =
          'Please contact reception when you arrive to be checked in and reinserted into the queue.';
      }
    }

    // Step 8: Increment monotonic queueVersion and compute queue-level timingSummary
    queue.queueVersion = (queue.queueVersion || 0) + 1;
    queue.lastRecalculatedAt = now;

    const firstWaiting = queueState.waiting[0];
    if (firstWaiting) {
      queue.timingSummary = {
        timingStatus: firstWaiting.timingStatus,
        queueDelayMinutes: firstWaiting.delayMinutes || 0,
        queueAheadMinutes: firstWaiting.aheadMinutes || 0,
        statusLabel: firstWaiting.statusLabel || 'On Time',
        updatedAt: now,
      };
    } else if (queueState.consulting) {
      queue.timingSummary = {
        timingStatus: 'in-consultation',
        queueDelayMinutes: queueState.consulting.delayMinutes || 0,
        queueAheadMinutes: 0,
        statusLabel: 'In Consultation',
        updatedAt: now,
      };
    } else {
      queue.timingSummary = {
        timingStatus: 'on-time',
        queueDelayMinutes: 0,
        queueAheadMinutes: 0,
        statusLabel: 'On Time',
        updatedAt: now,
      };
    }

    await queue.save({ session });

    // Step 9: Synchronize authoritative estimates and timing fields to Appointment documents
    for (const entry of queue.entries) {
      if (!entry.appointment) continue;
      const updateFields = {
        initialEstimatedStartTime: entry.initialEstimatedStartTime,
        initialEstimatedEndTime: entry.initialEstimatedEndTime,
        estimatedConsultationStartTime: entry.estimatedConsultationStartTime,
        estimatedConsultationEndTime: entry.estimatedConsultationEndTime,
        recommendedArrivalTime: entry.recommendedArrivalTime,
        queuePosition: entry.queuePosition,
        queueEntryStatus: entry.status,
        arrivalStatus: entry.arrivalStatus,
        timingStatus: entry.timingStatus,
        delayMinutes: entry.delayMinutes,
        aheadMinutes: entry.aheadMinutes,
        statusLabel: entry.statusLabel,
        statusMessage: entry.statusMessage,
        recommendedAction: entry.recommendedAction,
        consultationDurationMinutes: consultationMinutes,
        queueVersion: queue.queueVersion,
        attendanceWindowClosesAt: entry.attendanceWindowClosesAt,
        attendanceTimeoutApplied: entry.attendanceTimeoutApplied,
        attendanceTimeoutAppliedAt: entry.attendanceTimeoutAppliedAt,
        lastQueuePositionSnapshot: {
          position: entry.queuePosition,
          estimatedReportingTime: entry.estimatedConsultationStartTime,
          estimatedWaitingMinutes: entry.estimatedWaitingMinutes,
          snapshotAt: now,
        },
      };

      const updateQuery = Appointment.findByIdAndUpdate(entry.appointment, updateFields);
      if (session) {
        await updateQuery.session(session);
      } else {
        await updateQuery;
      }
    }

    return queue;
  }

  /**
   * Apply 5-minute attendance timeouts idempotently.
   * Tracked by attendanceTimeoutApplied flag so it is never applied twice.
   */
  static _applyPendingAttendanceTimeouts(queue, now = getHospitalNow()) {
    for (const entry of queue.entries) {
      if (entry.status !== QUEUE_ENTRY_STATUS.WAITING) continue;
      if (entry.arrivalStatus !== 'not-arrived') continue;
      if (!entry.attendanceWindowClosesAt) continue;
      if (entry.attendanceTimeoutApplied) continue;

      if (now >= entry.attendanceWindowClosesAt) {
        entry.attendanceTimeoutApplied = true;
        entry.attendanceTimeoutAppliedAt = now;
        entry.delayReason = 'patient-not-arrived-5min-timeout';
      }
    }
  }

  /**
   * Partition queue entries into:
   * - waiting: ONLY active waiting/called entries (excludes pending, skipped, completed, cancelled, no-show)
   * - consulting: entry currently in consultation
   * - completed: finished consultations
   * - inactive: pending, skipped, cancelled, or no-show entries
   */
  static _analyzeQueueState(queue, appointmentById = new Map()) {
    const waiting = [];
    let currentConsulting = null;
    const completed = [];
    const inactive = [];

    for (const entry of queue.entries) {
      const apt = appointmentById.get(entry.appointment?.toString());
      const isCancelledOrInactive =
        apt && (apt.status === APPOINTMENT_STATUS.CANCELLED || apt.isActive === false);

      if (isCancelledOrInactive) {
        inactive.push(entry);
        continue;
      }

      if (entry.status === QUEUE_ENTRY_STATUS.IN_CONSULTATION) {
        currentConsulting = entry;
      } else if (entry.status === QUEUE_ENTRY_STATUS.COMPLETED) {
        completed.push(entry);
      } else if (
        entry.status === QUEUE_ENTRY_STATUS.WAITING ||
        entry.status === QUEUE_ENTRY_STATUS.CALLED
      ) {
        waiting.push(entry);
      } else {
        // PENDING, SKIPPED, NO_SHOW are excluded from active waiting sequence
        inactive.push(entry);
      }
    }

    // Sort waiting: CALLED first, then by reinsertOrder (if rejoined) or original tokenNumber
    waiting.sort((a, b) => {
      if (a.status === QUEUE_ENTRY_STATUS.CALLED && b.status !== QUEUE_ENTRY_STATUS.CALLED) {
        return -1;
      }
      if (b.status === QUEUE_ENTRY_STATUS.CALLED && a.status !== QUEUE_ENTRY_STATUS.CALLED) {
        return 1;
      }
      const orderA = a.reinsertOrder != null ? a.reinsertOrder : a.tokenNumber;
      const orderB = b.reinsertOrder != null ? b.reinsertOrder : b.tokenNumber;
      if (orderA !== orderB) return orderA - orderB;
      return a.tokenNumber - b.tokenNumber;
    });

    completed.sort((a, b) => {
      const endA = a.actualEndDateTime || a.completedAt;
      const endB = b.actualEndDateTime || b.completedAt;
      if (!endA) return 1;
      if (!endB) return -1;
      return endA.getTime() - endB.getTime();
    });

    return {
      waiting,
      consulting: currentConsulting,
      completed,
      inactive,
    };
  }

  /**
   * Determine when the next available consultation slot starts based on actual timestamps.
   * Never adds incremental delays on top of previous estimates.
   */
  static _getNextAvailableSlotStart({
    queueState,
    consultationMinutes,
    sessionStart,
    now,
    shouldUseLiveClock,
  }) {
    // 1. Doctor is currently consulting a patient
    if (queueState.consulting) {
      const start =
        queueState.consulting.actualStartDateTime ||
        queueState.consulting.consultationStartedAt ||
        sessionStart;
      const expectedEnd = new Date(start.getTime() + consultationMinutes * 60000);

      // If the current consultation is running over its configured duration,
      // the next patient cannot start before `now`.
      if (shouldUseLiveClock && now.getTime() > expectedEnd.getTime()) {
        return new Date(now.getTime());
      }
      return expectedEnd;
    }

    // 2. Doctor is not currently consulting, and at least one consultation has finished
    if (queueState.completed.length > 0) {
      const lastCompleted = queueState.completed[queueState.completed.length - 1];
      const lastEnd = lastCompleted.actualEndDateTime || lastCompleted.completedAt;
      if (lastEnd) {
        if (shouldUseLiveClock && now.getTime() - lastEnd.getTime() >= 60000) {
          return new Date(now.getTime());
        }
        return new Date(lastEnd.getTime());
      }
    }

    // 3. No consultations have started or completed yet in this session
    if (shouldUseLiveClock && now.getTime() - sessionStart.getTime() >= 60000) {
      return new Date(now.getTime());
    }

    return new Date(sessionStart.getTime());
  }

  /**
   * Calculate sequential consultation slots and timing status for all active waiting entries.
   */
  static _calculateSequentialSlots({
    waitingEntries,
    nextSlotStart,
    consultationMinutes,
    normalizedDate,
    sessionStart,
    now,
    shouldUseLiveClock,
    hasActiveConsultation,
    lastCompletedEnd = null,
    appointmentById,
  }) {
    let currentSlotStart = new Date(nextSlotStart.getTime());
    const graceMinutes = BOOKING_CONSTRAINTS.PENDING_GRACE_PERIOD_MINUTES || 5;

    for (let i = 0; i < waitingEntries.length; i++) {
      const entry = waitingEntries[i];
      const position = i + 1;

      const slotStartDateTime = new Date(currentSlotStart.getTime());
      const slotEndDateTime = new Date(
        slotStartDateTime.getTime() + consultationMinutes * 60000
      );

      const slotStartTimeStr = datetimeToTimeString(slotStartDateTime);
      const slotEndTimeStr = datetimeToTimeString(slotEndDateTime);

      const baselineStart =
        entry.initialEstimatedStartTime ||
        combineDateAndTime(normalizedDate, entry.scheduledStartTime || '09:00');

      const rawDeltaMs = slotStartDateTime.getTime() - baselineStart.getTime();
      // Ignore sub-minute clock jitter (< 60s) to prevent oscillating between fast and late
      const deltaMinutes =
        Math.abs(rawDeltaMs) < 60000 ? 0 : Math.round(rawDeltaMs / 60000);

      const recommendedArrival = new Date(
        Math.max(
          sessionStart.getTime() - EARLY_REPORTING_BUFFER_MINUTES * 60000,
          slotStartDateTime.getTime() - EARLY_REPORTING_BUFFER_MINUTES * 60000
        )
      );

      const apt = appointmentById.get(entry.appointment?.toString());
      const hasArrived =
        entry.arrivalStatus === 'arrived-on-time' ||
        entry.arrivalStatus === 'arrived-late' ||
        apt?.status === APPOINTMENT_STATUS.CHECKED_IN ||
        Boolean(entry.checkedInAt || apt?.arrivedAt);

      // The doctor is available for position 1 starting from max(baselineStart, lastCompletedEnd).
      // A patient waiting for a delayed doctor must NEVER be marked late solely because the doctor was late.
      const doctorAvailableSince =
        position === 1 && !hasActiveConsultation && lastCompletedEnd
          ? new Date(Math.max(baselineStart.getTime(), lastCompletedEnd.getTime()))
          : baselineStart;
      const effectiveTurnDeadline = new Date(
        doctorAvailableSince.getTime() + graceMinutes * 60000
      );

      const isLatePatient =
        !hasArrived &&
        shouldUseLiveClock &&
        position === 1 &&
        !hasActiveConsultation &&
        now.getTime() >= effectiveTurnDeadline.getTime();

      let timingStatus = 'on-time';
      let delayMinutes = 0;
      let aheadMinutes = 0;
      let statusLabel = 'On Time';
      let statusMessage = 'Queue is running on time.';
      let recommendedAction = hasArrived
        ? 'You are checked in. Please remain in the waiting area for your turn.'
        : `Please arrive by ${formatTime12h(recommendedArrival)} and check in at reception.`;

      if (entry.status === QUEUE_ENTRY_STATUS.CALLED) {
        timingStatus = 'called';
        delayMinutes = Math.max(0, deltaMinutes);
        aheadMinutes = Math.max(0, -deltaMinutes);
        statusLabel = 'Called — Proceed to Room';
        statusMessage = "You're being called — please proceed to the consultation room now.";
        recommendedAction = "Proceed immediately to the doctor's consultation room.";
      } else if (isLatePatient) {
        timingStatus = 'late-patient';
        delayMinutes = Math.max(0, deltaMinutes);
        aheadMinutes = 0;
        statusLabel = 'Arrival Overdue';
        statusMessage = "You're late — please contact reception";
        recommendedAction =
          'Your expected reporting time has passed. Contact reception to confirm your position.';
      } else if (deltaMinutes >= 1) {
        timingStatus = 'delayed-queue';
        delayMinutes = deltaMinutes;
        aheadMinutes = 0;
        statusLabel = 'Doctor Running Late';
        statusMessage = `Doctor is running late — estimated delay ${deltaMinutes} min`;
        recommendedAction =
          'Please remain available. Your estimated time may change as consultations progress.';
      } else if (deltaMinutes <= -1) {
        timingStatus = 'ahead-of-schedule';
        delayMinutes = 0;
        aheadMinutes = Math.abs(deltaMinutes);
        statusLabel = 'Ahead of Schedule';
        statusMessage = `Queue is ahead of schedule — approximately ${Math.abs(deltaMinutes)} min`;
        recommendedAction =
          'Please arrive promptly. The doctor may be ready earlier than originally expected.';
      }

      entry.queuePosition = position;
      entry.estimatedStartTime = slotStartTimeStr;
      entry.estimatedEndTime = slotEndTimeStr;
      entry.estimatedReportingTime = slotStartDateTime;
      entry.estimatedConsultationStartTime = slotStartDateTime;
      entry.estimatedConsultationEndTime = slotEndDateTime;
      entry.recommendedArrivalTime = recommendedArrival;
      entry.estimatedWaitingMinutes = Math.max(
        0,
        Math.round((slotStartDateTime.getTime() - now.getTime()) / 60000)
      );
      entry.delayMinutesFromScheduled = deltaMinutes;
      entry.timingStatus = timingStatus;
      entry.delayMinutes = delayMinutes;
      entry.aheadMinutes = aheadMinutes;
      entry.statusLabel = statusLabel;
      entry.statusMessage = statusMessage;
      entry.recommendedAction = recommendedAction;
      entry.lastUpdatedAt = now;

      currentSlotStart = new Date(slotEndDateTime.getTime());
    }
  }

  static _datetimeToTimeString(datetime) {
    return datetimeToTimeString(datetime);
  }

  /**
   * Case-insensitive weekday lookup so both 'monday' and 'Monday' match.
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
    const dayOfWeek = dayNames[normalizeDateOnly(appointmentDate).getUTCDay()];
    const matched = doctor?.availability?.find(
      (slot) => String(slot.day || '').toLowerCase() === dayOfWeek
    );
    return matched || doctor?.availability?.[0] || null;
  }

  /**
   * Mark a patient as arrived (or rejoin if previously pending/skipped) and recalculate.
   */
  static async markPatientArrived(queueId, entryId, isLate = false, session) {
    const queueQuery = Queue.findById(queueId);
    const queue = await (session ? queueQuery.session(session) : queueQuery);
    if (!queue) throw new Error('Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new Error('Queue entry not found');

    const now = getHospitalNow();
    const wasLate =
      isLate ||
      (entry.attendanceWindowClosesAt && now > entry.attendanceWindowClosesAt) ||
      [QUEUE_ENTRY_STATUS.PENDING, QUEUE_ENTRY_STATUS.SKIPPED].includes(entry.status);

    // If patient was pending or skipped and is rejoining, restore to waiting without duplicating
    if ([QUEUE_ENTRY_STATUS.PENDING, QUEUE_ENTRY_STATUS.SKIPPED].includes(entry.status)) {
      entry.status = QUEUE_ENTRY_STATUS.WAITING;
      entry.rejoinedAt = now;
    }

    entry.checkedInAt = entry.checkedInAt || now;
    entry.arrivalStatus = wasLate ? 'arrived-late' : 'arrived-on-time';
    entry.attendanceTimeoutApplied = true;

    await queue.save({ session });
    await this.recalculateQueue(queue.doctor, queue.date, session);
    return entry;
  }

  /**
   * Record consultation start and recalculate queue.
   */
  static async recordConsultationStart(queueId, entryId, session) {
    const queueQuery = Queue.findById(queueId);
    const queue = await (session ? queueQuery.session(session) : queueQuery);
    if (!queue) throw new Error('Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new Error('Queue entry not found');

    const now = getHospitalNow();
    entry.actualStartDateTime = now;
    entry.consultationStartedAt = now;
    entry.actualStartTime = datetimeToTimeString(now);
    entry.status = QUEUE_ENTRY_STATUS.IN_CONSULTATION;
    queue.currentTokenNumber = entry.tokenNumber;

    await queue.save({ session });
    await this.recalculateQueue(queue.doctor, queue.date, session);
    return entry;
  }

  /**
   * Record consultation completion and recalculate remaining queue.
   */
  static async recordConsultationCompletion(queueId, entryId, doctorId, appointmentDate, session) {
    const queueQuery = Queue.findById(queueId);
    const queue = await (session ? queueQuery.session(session) : queueQuery);
    if (!queue) throw new Error('Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new Error('Queue entry not found');

    const now = getHospitalNow();
    entry.actualEndDateTime = now;
    entry.completedAt = now;
    entry.actualEndTime = datetimeToTimeString(now);
    entry.status = QUEUE_ENTRY_STATUS.COMPLETED;

    const startTime = entry.actualStartDateTime || entry.consultationStartedAt;
    if (startTime) {
      const durationMs = Math.max(0, now.getTime() - startTime.getTime());
      entry.actualDurationMinutes = Math.max(1, Math.round(durationMs / 60000));
    }

    await queue.save({ session });

    const recalculated = await this.recalculateQueue(
      doctorId || queue.doctor,
      appointmentDate || queue.date,
      session
    );

    return { entry, recalculatedQueue: recalculated };
  }
}

module.exports = QueueScheduler;
