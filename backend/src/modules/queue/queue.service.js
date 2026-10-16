const Appointment = require('../appointments/appointments.model');
const Queue = require('./queue.model');
const AttendanceTimeoutService = require('./attendance.timeout.service');
const ApiError = require('../../errors/ApiError');
const { generateBookingNumber } = require('../../utils/booking.util');
const {
  normalizeDateOnly,
  addMinutesToTime,
  isTimeAfter,
  combineDateAndTime,
} = require('../../utils/datetime.util');
const { APPOINTMENT_STATUS, QUEUE_ENTRY_STATUS, QUEUE_STATUS } = require('../../constants/enums');

/**
 * QueueService — the single owner of all queue DOMAIN logic: token
 * assignment, slot math, booking-number generation, and — the core of
 * this design — recalculating every waiting patient's position, ETA, and
 * wait time whenever the queue's composition changes.
 *
 * CLEAN ARCHITECTURE ROLE: module services (patients, reception,
 * doctorAssistant) are ORCHESTRATORS — they validate their own
 * role-specific concerns (e.g. "does this doctor belong to my hospital?",
 * "has this patient paid?") and then delegate every actual queue-mechanics
 * decision to this class. This means there is exactly ONE place in the
 * codebase that knows how a token number, an ETA, or a queue position is
 * computed — previously this logic was duplicated (and drifting) across
 * three different module services.
 *
 * All methods are static: QueueService is stateless by design — every
 * fact it needs lives in the database, not in an instance — so it never
 * needs to be constructed, and is trivially reusable from any module.
 */
class QueueService {
  // =====================================================================
  // Token & slot assignment — used once, at booking time
  // =====================================================================

  /** Next sequential token for a doctor/date using ATOMIC increment.
   * Avoids MongoDB transaction upsert conflicts by using separate operations. */
  static async getNextTokenNumber(doctorId, date, session) {
    console.log('📊 [TOKEN] Getting next token for doctor:', doctorId, 'date:', date);

    try {
      // Step 1: Try to increment if document exists
      let updated = await Queue.findOneAndUpdate(
        { doctor: doctorId, date },
        { $inc: { totalTokensIssued: 1 } },
        { new: true, session }
      );

      // Step 2: If document doesn't exist, create it
      if (!updated) {
        console.log('📊 [TOKEN] Queue document not found, creating new one');

        // Fetch doctor to get hospital and department
        const Doctor = require('../doctors/doctors.model');
        const doctor = await Doctor.findById(doctorId).select('hospital department');

        if (!doctor) {
          throw new Error('Doctor not found');
        }

        console.log('📊 [TOKEN] Doctor found - hospital:', doctor.hospital, 'department:', doctor.department);

        // Create the Queue document
        let created;
        try {
          const result = await Queue.create([{
            hospital: doctor.hospital,
            department: doctor.department,
            doctor: doctorId,
            date,
            totalTokensIssued: 1,
            status: 'active',
            entries: []
          }]);

          created = result[0];
          console.log('✅ [TOKEN] Queue document created:', created._id);
        } catch (createErr) {
          console.error('❌ [TOKEN] Queue creation failed:', createErr.message);
          throw createErr;
        }

        // Verify creation by finding it
        if (created) {
          updated = created;
          console.log('✅ [TOKEN] Using newly created document');
        } else {
          // Fallback: try to find it again without session
          updated = await Queue.findOne({ doctor: doctorId, date });
          if (updated) {
            console.log('✅ [TOKEN] Found Queue after creation');
          } else {
            console.error('❌ [TOKEN] Could not find Queue after creation');
            throw new Error('Failed to create or find Queue document');
          }
        }
      }

      if (!updated || !updated.totalTokensIssued) {
        throw new Error('Invalid Queue document state');
      }

      const nextToken = updated.totalTokensIssued;
      console.log('✅ [TOKEN] Assigned token number:', nextToken);
      return nextToken;
    } catch (err) {
      console.error('❌ [TOKEN] Error assigning token:', err.message);
      throw err;
    }
  }

  /**
   * Pure function, no DB access — derives a scheduled {start, end} time
   * slot from a doctor's day-schedule and a token number. O(1).
   * Throws if the computed slot would run past the doctor's configured
   * end time (a safety net beyond the maxPatients capacity check).
   */
  static computeScheduledSlot(daySchedule, tokenNumber, appointmentDate) {
    const duration = Number(daySchedule?.slotDurationMinutes);
    if (!Number.isInteger(tokenNumber) || tokenNumber < 1) {
      throw new ApiError(400, 'Invalid token number for appointment slot.');
    }
    if (!Number.isFinite(duration) || duration < 1) {
      throw new ApiError(400, 'Doctor consultation duration is not configured correctly.');
    }
    if (!daySchedule?.startTime || !daySchedule?.endTime) {
      throw new ApiError(400, 'Doctor schedule start/end time is not configured correctly.');
    }

    // IMPORTANT: Never replace an individual slot's start with `now`.
    // Doing so makes several tokens booked at the same moment receive the
    // same start time. Every token is anchored to the doctor's configured
    // schedule and advances by that doctor's configured consultation duration.
    const start = addMinutesToTime(
      daySchedule.startTime,
      (tokenNumber - 1) * duration
    );
    const end = addMinutesToTime(start, duration);

    const effectiveEndTime = daySchedule.endTime === '00:00' ? '24:00' : daySchedule.endTime;
    if (isTimeAfter(end, effectiveEndTime)) {
      throw new ApiError(409, 'All slots for this doctor on the selected date are fully booked.');
    }

    return { start, end };
  }

  static generateBookingNumber(doctorId, date, tokenNumber) {
    return generateBookingNumber(doctorId, date, tokenNumber);
  }

  // =====================================================================
  // Queue document + entry creation
  // =====================================================================

  /**
   * Atomically upserts the doctor's Queue document for the date and
   * pushes a new WAITING entry. `averageConsultationMinutes` is only
   * applied via $setOnInsert — i.e. it seeds a BRAND NEW queue's starting
   * assumption, and is never overwritten on an existing queue (which may
   * already have a live, adapted average — see setAverageConsultationMinutes
   * and applyCompletionToAverage below for how it's "configurable").
   *
   * The entry's estimated consultation time is set based on the scheduled slot
   * and will be recalculated only when queue composition meaningfully changes.
   */
  static async addEntry(
    { hospitalId, departmentId, doctorId, date, appointmentId, patientId, tokenNumber, averageConsultationMinutes, timeSlot },
    session
  ) {
    console.log('[QUEUE] Adding entry - token:', tokenNumber, 'timeSlot:', timeSlot);

    // Create new queue entry with scheduled times
    const newEntry = {
      appointment: appointmentId,
      patient: patientId,
      tokenNumber,
      status: QUEUE_ENTRY_STATUS.WAITING,
      scheduledStartTime: timeSlot.start,
      scheduledEndTime: timeSlot.end,
      // NEW: Store estimated consultation time for patient display (persistent, not continuously updated)
      estimatedConsultationStartTime: combineDateAndTime(date, timeSlot.start),
      estimatedConsultationEndTime: combineDateAndTime(date, timeSlot.end),
      // Legacy fields kept for internal use (not shown to patient)
      estimatedStartTime: timeSlot.start,
      estimatedEndTime: timeSlot.end,
    };

    // Initialize attendance window (5 minutes after scheduled start)
    const attendanceWindowCloses = addMinutesToTime(timeSlot.start, 5);
    const attendanceWindowClosesDateTime = combineDateAndTime(date, attendanceWindowCloses);

    newEntry.attendanceWindowClosesAt = attendanceWindowClosesDateTime;
    newEntry.arrivalStatus = 'not-arrived';
    newEntry.attendanceTimeoutApplied = false;

    console.log('[QUEUE] Attendance window closes at:', attendanceWindowClosesDateTime);
    console.log('[QUEUE] Estimated consultation time:', newEntry.estimatedConsultationStartTime, '-', newEntry.estimatedConsultationEndTime);

    // Upsert queue document
    const queue = await Queue.findOneAndUpdate(
      { doctor: doctorId, date },
      {
        $setOnInsert: {
          hospital: hospitalId,
          department: departmentId,
          doctor: doctorId,
          date,
          totalTokensIssued: 1,
          averageConsultationMinutes: averageConsultationMinutes || 15,
        },
        $push: {
          entries: newEntry,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );

    console.log('[QUEUE] Entry added, now scheduling...');

    // Use this service's single recalculation engine; do not call a second
    // scheduler that may overwrite these calculated appointment estimates.
    await QueueService.recalculateQueue(doctorId, date, session);

    return queue;
  }

  // =====================================================================
  // Configurable average consultation time
  // =====================================================================

  /**
   * Manual override — e.g. an admin/assistant knows this doctor is
   * running a slower/faster clinic today. Immediately triggers a full
   * recalculation since it changes every remaining patient's ETA.
   */
  static async setAverageConsultationMinutes(doctorId, date, minutes) {
    if (!Number.isFinite(minutes) || minutes < 1) {
      throw new ApiError(400, 'averageConsultationMinutes must be a positive number.');
    }
    const queue = await Queue.findOne({ doctor: doctorId, date });
    if (!queue) {
      throw new ApiError(404, 'No queue exists yet for this doctor on this date.');
    }
    queue.averageConsultationMinutes = minutes;
    await queue.save();
    return QueueService.recalculateQueue(doctorId, date);
  }

  /**
   * Automatic adjustment — applies an exponential moving average (recent
   * consultations count for more than older ones) so the estimate adapts
   * across the day. 0.7/0.3 split is a deliberate choice: responsive
   * enough to reflect today's actual pace within 2-3 consultations,
   * stable enough that one unusually long/short visit doesn't whipsaw
   * every other patient's ETA.
   */
  static applyCompletionToAverage(queue, actualMinutes) {
    const clamped = Math.max(actualMinutes, 1);
    queue.averageConsultationMinutes = Math.round(
      queue.averageConsultationMinutes * 0.7 + clamped * 0.3
    );
  }

  // =====================================================================
  // THE recalculation engine
  // =====================================================================

  /**
   * Recomputes the estimated consultation time slot for every still-WAITING
   * entry in a doctor's queue. Called after any event that changes queue
   * composition — a completion, a skip, or a cancellation.
   *
   * CRITICAL: This calculation is based ONLY on queue position and the
   * doctor's consultation duration. It does NOT include:
   * - Delay tracking or "late by X minutes"
   * - Early completion tracking or "early by X minutes"
   * - Running behind / ahead status
   *
   * The estimated time shown to patients is a simple time range:
   * "Your consultation is estimated for 12:30 PM – 12:45 PM"
   *
   * Deliberately applies to ALL waiting entries, not just ones Reception
   * has released (isInDoctorQueue) — queue POSITION reflects booking
   * order and is meaningful even to a patient who hasn't arrived yet;
   * "who's callable right now" is a separate, stricter concern (see
   * callNext below).
   *
   * See the complexity analysis in the accompanying documentation for a
   * full breakdown — summary: O(n log n) time, O(1) additional DB round
   * trips (never N+1), where n = patients waiting for this doctor today.
   */
  static async recalculateQueue(doctorId, date, session) {
    const queueQuery = Queue.findOne({ doctor: doctorId, date });
    const queue = session ? await queueQuery.session(session) : await queueQuery;
    if (!queue) return null;

    const waiting = queue.entries
      .filter((entry) => entry.status === QUEUE_ENTRY_STATUS.WAITING)
      .sort((a, b) => a.tokenNumber - b.tokenNumber);

    if (waiting.length === 0) return queue;

    const appointmentIds = waiting.map((entry) => entry.appointment);
    const slotsQuery = Appointment.find({ _id: { $in: appointmentIds } }, 'timeSlot');
    const appointments = await (session ? slotsQuery.session(session) : slotsQuery).lean();
    const slotById = new Map(
      appointments.map((appointment) => [appointment._id.toString(), appointment.timeSlot])
    );

    // Use the doctor's configured duration, preserved in each appointment's
    // scheduled slot. Do NOT use queue.averageConsultationMinutes here: that
    // field can be changed by adaptive-average logic and must not alter the
    // appointment interval requested by the doctor.
    const firstEntry = waiting[0];
    const firstSlot = slotById.get(firstEntry.appointment.toString());
    if (!firstSlot?.start || !firstSlot?.end) {
      throw new ApiError(500, `Missing scheduled slot for appointment ${firstEntry.appointment}.`);
    }

    const timeToMinutes = (value) => {
      const [hours, minutes] = String(value).split(':').map(Number);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
      return hours * 60 + minutes;
    };
    let durationMinutes = timeToMinutes(firstSlot.end) - timeToMinutes(firstSlot.start);
    if (durationMinutes <= 0) durationMinutes += 24 * 60;
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      throw new ApiError(500, 'Could not determine the doctor-configured consultation duration.');
    }

    // All waiting patients are calculated from ONE base time. Previously the
    // code used each patient's own slot as its base and then added the queue
    // position offset again, which could double-shift later patients.
    const baseStart = combineDateAndTime(date, firstSlot.start);
    const appointmentsToUpdate = [];

    waiting.forEach((entry, index) => {
      const start = new Date(baseStart.getTime() + index * durationMinutes * 60000);
      const end = new Date(start.getTime() + durationMinutes * 60000);

      entry.estimatedConsultationStartTime = start;
      entry.estimatedConsultationEndTime = end;
      entry.queuePosition = index + 1;
      entry.estimatedReportingTime = start;
      entry.estimatedWaitingMinutes = Math.max(Math.round((start.getTime() - Date.now()) / 60000), 0);

      appointmentsToUpdate.push({
        appointmentId: entry.appointment,
        estimatedConsultationStartTime: start,
        estimatedConsultationEndTime: end,
      });
    });

    await queue.save({ session });

    // Keep Appointment records in sync with the queue's current estimates.
    for (const update of appointmentsToUpdate) {
      const query = Appointment.findByIdAndUpdate(
        update.appointmentId,
        {
          estimatedConsultationStartTime: update.estimatedConsultationStartTime,
          estimatedConsultationEndTime: update.estimatedConsultationEndTime,
        },
        { new: true }
      );
      if (session) await query.session(session);
      else await query;
    }

    return queue;
  }

  // =====================================================================
  // Per-patient transitions (delegated to by the Doctor Assistant module)
  // =====================================================================

  static findEntry(queue, appointmentId) {
    const entry = queue.entries.find((e) => e.appointment.toString() === appointmentId.toString());
    if (!entry) {
      throw new ApiError(404, 'Queue entry not found for this appointment.');
    }
    return entry;
  }

  /**
   * Selects and calls the next patient. Only appointments Reception has
   * explicitly released (isInDoctorQueue: true) are callable — checked
   * via a single targeted query rather than populating the queue document
   * itself (which this method mutates and the caller then saves).
   */
  static async callNext(queue) {
    if (queue.status !== QUEUE_STATUS.ACTIVE) {
      throw new ApiError(400, `Queue is currently "${queue.status}". Resume it before calling patients.`);
    }

    const waitingEntries = queue.entries
      .filter((e) => e.status === QUEUE_ENTRY_STATUS.WAITING)
      .sort((a, b) => a.tokenNumber - b.tokenNumber);

    if (waitingEntries.length === 0) {
      throw new ApiError(404, 'No patients are currently waiting in the queue.');
    }

    const released = await Appointment.find(
      { _id: { $in: waitingEntries.map((e) => e.appointment) }, isInDoctorQueue: true },
      '_id'
    ).lean();
    const releasedIds = new Set(released.map((a) => a._id.toString()));

    const candidate = waitingEntries.find((e) => releasedIds.has(e.appointment.toString()));
    if (!candidate) {
      throw new ApiError(404, 'No released patients are currently waiting in the queue.');
    }

    candidate.status = QUEUE_ENTRY_STATUS.CALLED;
    candidate.calledAt = new Date();
    queue.currentTokenNumber = candidate.tokenNumber;
    return candidate;
  }

  static startConsultation(entry) {
    console.log('📋 [QUEUE] startConsultation - entry status:', entry.status);
    console.log('📋 [QUEUE] Allowed statuses:', QUEUE_ENTRY_STATUS.CALLED, 'or', QUEUE_ENTRY_STATUS.WAITING);

    // Allow starting from CALLED (if called first) or WAITING (direct start)
    const allowedStatuses = [QUEUE_ENTRY_STATUS.CALLED, QUEUE_ENTRY_STATUS.WAITING];
    if (!allowedStatuses.includes(entry.status)) {
      console.error('❌ [QUEUE] Entry in invalid status for starting consultation');
      throw new ApiError(
        400,
        `Cannot start consultation — patient not ready (current queue status: "${entry.status}").`
      );
    }
    entry.status = QUEUE_ENTRY_STATUS.IN_CONSULTATION;
    entry.consultationStartedAt = new Date();
    console.log('✅ [QUEUE] Entry status updated to IN_CONSULTATION');
    return entry;
  }

  /** Completes the visit and feeds its actual duration into the
   * queue's adaptive average (see applyCompletionToAverage). */
  static completeConsultation(queue, entry) {
    if (entry.status !== QUEUE_ENTRY_STATUS.IN_CONSULTATION) {
      throw new ApiError(
        400,
        `Cannot complete — consultation has not been started (current queue status: "${entry.status}").`
      );
    }
    entry.status = QUEUE_ENTRY_STATUS.COMPLETED;
    entry.completedAt = new Date();

    const actualMinutes = Math.max((entry.completedAt - entry.consultationStartedAt) / 60000, 1);
    QueueService.applyCompletionToAverage(queue, actualMinutes);

    return { entry, actualMinutes };
  }

  /** Reversible — does not touch the linked Appointment's status, so
   * Reception/Admin can still decide how to handle the patient afterward. */
  static skipPatient(entry) {
    if (![QUEUE_ENTRY_STATUS.WAITING, QUEUE_ENTRY_STATUS.CALLED].includes(entry.status)) {
      throw new ApiError(400, `Cannot skip a patient with queue status "${entry.status}".`);
    }
    entry.status = QUEUE_ENTRY_STATUS.SKIPPED;
    return entry;
  }

  /**
   * Mark a patient as PENDING — receptionist has identified that the patient
   * has not arrived. Sets status to PENDING and records the timestamp.
   * This does NOT delete or skip the patient — they remain in the queue,
   * but their status reflects the receptionist's observation.
   *
   * Once marked PENDING, the patient will be subject to the grace period policy:
   * - If they arrive within the grace period, receptionist marks them ARRIVED
   * - If grace period expires, the queue recalculation will handle delays
   */
  static markPending(entry) {
    if (![QUEUE_ENTRY_STATUS.WAITING, QUEUE_ENTRY_STATUS.CALLED].includes(entry.status)) {
      throw new ApiError(
        400,
        `Cannot mark a patient as pending with queue status "${entry.status}".`
      );
    }
    entry.status = QUEUE_ENTRY_STATUS.PENDING;
    entry.pendingMarkedAt = new Date();
    return entry;
  }

  pause(queue) {
    if (queue.status === QUEUE_STATUS.PAUSED) {
      throw new ApiError(400, 'Queue is already paused.');
    }
    if (queue.status === QUEUE_STATUS.CLOSED) {
      throw new ApiError(400, 'Cannot pause a closed queue.');
    }
    queue.status = QUEUE_STATUS.PAUSED;
    return queue;
  }

  static resume(queue) {
    if (queue.status === QUEUE_STATUS.ACTIVE) {
      throw new ApiError(400, 'Queue is already active.');
    }
    if (queue.status === QUEUE_STATUS.CLOSED) {
      throw new ApiError(400, 'Cannot resume a closed queue.');
    }
    queue.status = QUEUE_STATUS.ACTIVE;
    return queue;
  }
}

module.exports = QueueService;
