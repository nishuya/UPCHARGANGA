const Appointment = require('../appointments/appointments.model');
const Queue = require('./queue.model');
const QueueScheduler = require('./queue.scheduler.service');
const AttendanceTimeoutService = require('./attendance.timeout.service');
const ApiError = require('../../errors/ApiError');
const { generateBookingNumber } = require('../../utils/booking.util');
const {
  allocateNextTimeSlot,
  resolveConsultationDuration,
  nextSlotFromCursor,
  sessionEndMinutes,
} = require('../../utils/slotAllocation.util');
const {
  normalizeDateOnly,
  addMinutesToTime,
  combineDateAndTime,
  getCurrentTimeString,
  getHospitalNow,
  isSameUTCDate,
  timeToMinutes,
  minutesToTime,
} = require('../../utils/datetime.util');
const { APPOINTMENT_STATUS, QUEUE_ENTRY_STATUS, QUEUE_STATUS } = require('../../constants/enums');

const SLOT_FREE_STATUSES = [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.EXPIRED];

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
      let updated = await Queue.findOneAndUpdate(
        { doctor: doctorId, date },
        { $inc: { totalTokensIssued: 1 } },
        { new: true, session }
      );

      if (!updated) {
        const Doctor = require('../doctors/doctors.model');
        const doctorQuery = Doctor.findById(doctorId).select('hospital department');
        const doctor = session ? await doctorQuery.session(session) : await doctorQuery;

        if (!doctor) {
          throw new Error('Doctor not found');
        }

        try {
          const [created] = await Queue.create(
            [
              {
                hospital: doctor.hospital,
                department: doctor.department,
                doctor: doctorId,
                date,
                totalTokensIssued: 1,
                status: 'active',
                entries: [],
              },
            ],
            { session }
          );
          updated = created;
        } catch (createErr) {
          // Concurrent first booking: the other request won the unique index.
          if (createErr.code === 11000) {
            updated = await Queue.findOneAndUpdate(
              { doctor: doctorId, date },
              { $inc: { totalTokensIssued: 1 } },
              { new: true, session }
            );
          } else {
            throw createErr;
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
   * Derives the next unique {start, end} slot from the doctor's session,
   * already-assigned appointments, token order, and (for today) current time.
   *
   * Same-day bookings previously all snapped independently to "now", which
   * assigned the same clock time to multiple patients. Occupying end times
   * (and the atomic Queue cursor) must be supplied so each new booking
   * starts when the previous one ends.
   */
  static computeScheduledSlot(daySchedule, tokenNumber, appointmentDate, options = {}) {
    const duration = resolveConsultationDuration(daySchedule);
    const gridStart = addMinutesToTime(daySchedule.startTime, (tokenNumber - 1) * duration);
    const now = options.now || getHospitalNow();
    const isToday = Boolean(appointmentDate && isSameUTCDate(appointmentDate, now));
    const nowTimeString = options.nowTimeString ?? (isToday ? getCurrentTimeString() : null);

    console.log('⏰ [SLOT] Computing slot for token:', tokenNumber);
    console.log('   Start time:', daySchedule.startTime);
    console.log('   Slot duration:', duration, 'minutes');
    console.log('   Grid start:', gridStart);
    console.log('   End time limit:', daySchedule.endTime);
    console.log('   Occupying ends:', options.occupyingEndTimes || []);
    console.log('   Cursor end minutes:', options.lastAssignedSlotEndMinutes);
    console.log('   Same-day booking - current time:', nowTimeString);

    const slot = allocateNextTimeSlot({
      startTime: daySchedule.startTime,
      endTime: daySchedule.endTime,
      durationMinutes: duration,
      occupyingEndTimes: options.occupyingEndTimes || [],
      gridStartTime: gridStart,
      isToday,
      nowTimeString,
      lastAssignedSlotEndMinutes: options.lastAssignedSlotEndMinutes,
    });

    console.log('   Final slot - start:', slot.start, 'end:', slot.end);
    return { start: slot.start, end: slot.end };
  }

  /**
   * Atomically claims the next unique consultation window for this doctor/date.
   *
   * Uses Queue.lastAssignedSlotEndMinutes as a monotonic cursor so two
   * concurrent transactions cannot both allocate the same start time even
   * when appointment reads still show an identical occupying set.
   */
  static async allocateScheduledSlot(daySchedule, tokenNumber, appointmentDate, { doctorId, session, nowTimeString } = {}) {
    const duration = resolveConsultationDuration(daySchedule);
    const normalizedDate = normalizeDateOnly(appointmentDate);
    const now = getHospitalNow();
    const isToday = isSameUTCDate(normalizedDate, now);
    const effectiveNow = nowTimeString ?? (isToday ? getCurrentTimeString() : null);

    let floorMinutes = timeToMinutes(daySchedule.startTime);
    if (isToday && effectiveNow) {
      floorMinutes = Math.max(floorMinutes, timeToMinutes(effectiveNow));
    }

    const limit = sessionEndMinutes(daySchedule.endTime);

    // Belt-and-suspenders: also consider already-persisted appointment ends
    // (visible inside this transaction) so the cursor cannot lag behind reality.
    const occupyingQuery = Appointment.find({
      doctor: doctorId,
      appointmentDate: normalizedDate,
      isActive: true,
      status: { $nin: SLOT_FREE_STATUSES },
    }).select('timeSlot');

    const occupying = session ? await occupyingQuery.session(session).lean() : await occupyingQuery.lean();
    const occupyingEndMinutes = occupying
      .map((appointment) => appointment.timeSlot?.end)
      .filter(Boolean)
      .map((end) => timeToMinutes(end));
    const occupyingFloor =
      occupyingEndMinutes.length > 0 ? Math.max(...occupyingEndMinutes) : null;

    if (occupyingFloor != null) {
      floorMinutes = Math.max(floorMinutes, occupyingFloor);
    }

    // Do NOT raise the floor by token-grid offset here. Concurrent bookers
    // can receive tokens out of claim order; the atomic cursor alone keeps
    // start times unique and sequential. Token numbers remain authoritative
    // for queue ordering via getNextTokenNumber.

    const claimSlot = async (currentFloor) => {
      const queueQuery = Queue.findOne({ doctor: doctorId, date: normalizedDate }).select(
        'lastAssignedSlotEndMinutes'
      );
      const existing = session ? await queueQuery.session(session) : await queueQuery;
      const previousEnd = existing?.lastAssignedSlotEndMinutes ?? null;
      const { startMinutes, endMinutes } = nextSlotFromCursor(currentFloor, previousEnd, duration);

      if (startMinutes >= limit || endMinutes > limit) {
        throw new ApiError(
          409,
          'No valid appointment slots are available for this doctor in the selected session.'
        );
      }

      // Atomic compare-and-set: only advance the cursor if it still matches
      // what we read (or is still unset). Concurrent bookers retry.
      const filter = {
        doctor: doctorId,
        date: normalizedDate,
        $or: [
          { lastAssignedSlotEndMinutes: previousEnd },
          ...(previousEnd == null
            ? [{ lastAssignedSlotEndMinutes: null }, { lastAssignedSlotEndMinutes: { $exists: false } }]
            : []),
        ],
      };

      const updated = await Queue.findOneAndUpdate(
        filter,
        { $set: { lastAssignedSlotEndMinutes: endMinutes } },
        { new: true, session }
      );

      if (!updated) {
        return null; // lost the race — caller retries
      }

      return {
        start: minutesToTime(startMinutes),
        end: minutesToTime(endMinutes),
      };
    };

    let slot = null;
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      slot = await claimSlot(floorMinutes);
      if (slot) break;

      // Another writer advanced the cursor — re-read and try again from the
      // latest cursor (nextSlotFromCursor will pick max(floor, cursor)).
      const refreshedQuery = Queue.findOne({ doctor: doctorId, date: normalizedDate }).select(
        'lastAssignedSlotEndMinutes'
      );
      const refreshed = session ? await refreshedQuery.session(session) : await refreshedQuery;
      if (refreshed?.lastAssignedSlotEndMinutes != null) {
        floorMinutes = Math.max(floorMinutes, refreshed.lastAssignedSlotEndMinutes);
      }
    }

    if (!slot) {
      throw new ApiError(
        409,
        'Could not reserve a unique appointment slot due to concurrent bookings. Please try again.'
      );
    }

    console.log('⏰ [SLOT] Atomically claimed slot:', slot.start, '-', slot.end, 'for token', tokenNumber);
    return slot;
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
    const now = getHospitalNow();
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
          averageConsultationMinutes: averageConsultationMinutes,
        },
        $push: {
          entries: newEntry,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );

    console.log('[QUEUE] Entry added, now scheduling...');

    // Recalculate queue to ensure correct sequential slots
    await QueueScheduler.recalculateQueue(doctorId, date, session);

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
   * Recomputes live estimated consultation times for the doctor's queue.
   *
   * SINGLE SOURCE OF TRUTH: delegates entirely to QueueScheduler so booking,
   * reception, doctor-assistant, cancellation, and cron paths cannot drift
   * into competing formulas. Booked timeSlot values are never overwritten
   * here — only estimatedConsultation* fields are recalculated.
   */
  static async recalculateQueue(doctorId, date, session) {
    return QueueScheduler.recalculateQueue(doctorId, date, session);
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
    const now = getHospitalNow();
    entry.status = QUEUE_ENTRY_STATUS.IN_CONSULTATION;
    entry.consultationStartedAt = now;
    // QueueScheduler reads actualStartDateTime when cascading live estimates.
    entry.actualStartDateTime = now;
    entry.actualStartTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
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
    const now = getHospitalNow();
    entry.status = QUEUE_ENTRY_STATUS.COMPLETED;
    entry.completedAt = now;
    entry.actualEndDateTime = now;
    entry.actualEndTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

    const startedAt = entry.actualStartDateTime || entry.consultationStartedAt || now;
    const actualMinutes = Math.max((now - startedAt) / 60000, 1);
    entry.actualDurationMinutes = Math.round(actualMinutes);
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
