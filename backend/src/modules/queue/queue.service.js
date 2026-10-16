const Appointment = require('../appointments/appointments.model');
const Queue = require('./queue.model');
const QueueScheduler = require('./queue.scheduler.service');
const AttendanceTimeoutService = require('./attendance.timeout.service');
const ApiError = require('../../errors/ApiError');
const { generateBookingNumber } = require('../../utils/booking.util');
const {
  allocateNextTimeSlot,
  resolveConsultationDuration,
} = require('../../utils/slotAllocation.util');
const {
  normalizeDateOnly,
  addMinutesToTime,
  combineDateAndTime,
  getCurrentTimeString,
  getHospitalNow,
  isSameUTCDate,
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
   * must be supplied so each new booking starts when the previous one ends.
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
    console.log('   Same-day booking - current time:', nowTimeString);

    const slot = allocateNextTimeSlot({
      startTime: daySchedule.startTime,
      endTime: daySchedule.endTime,
      durationMinutes: duration,
      occupyingEndTimes: options.occupyingEndTimes || [],
      gridStartTime: gridStart,
      isToday,
      nowTimeString,
    });

    console.log('   Final slot - start:', slot.start, 'end:', slot.end);
    return slot;
  }

  /**
   * Reads already-booked slots for this doctor/date (inside the caller's
   * transaction) and allocates the next unique consultation window.
   */
  static async allocateScheduledSlot(daySchedule, tokenNumber, appointmentDate, { doctorId, session, nowTimeString } = {}) {
    const occupyingQuery = Appointment.find({
      doctor: doctorId,
      appointmentDate: normalizeDateOnly(appointmentDate),
      isActive: true,
      status: { $nin: SLOT_FREE_STATUSES },
    }).select('timeSlot');

    const occupying = session ? await occupyingQuery.session(session).lean() : await occupyingQuery.lean();

    return QueueService.computeScheduledSlot(daySchedule, tokenNumber, appointmentDate, {
      occupyingEndTimes: occupying.map((appointment) => appointment.timeSlot?.end).filter(Boolean),
      nowTimeString,
    });
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
          averageConsultationMinutes: averageConsultationMinutes || 15,
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
      .filter((e) => e.status === QUEUE_ENTRY_STATUS.WAITING)
      .sort((a, b) => a.tokenNumber - b.tokenNumber);

    if (waiting.length === 0) return queue;

    // Fetch each waiting entry's originally scheduled slot in ONE query
    // (not populate-on-the-queue-then-save, which risks Mongoose
    // re-serializing populated subdocuments incorrectly on save; and not
    // N+1 individual lookups either).
    //
    // MUST use the same session as the caller: bookAppointment calls this
    // mid-transaction, right after creating the Appointment — without
    // `.session(session)` here, this query can't see that just-created,
    // not-yet-committed document, `slots` comes back missing it, and
    // `slotById.get(...)` returns undefined below.
    const appointmentIds = waiting.map((e) => e.appointment);
    const slotsQuery = Appointment.find({ _id: { $in: appointmentIds } }, 'timeSlot');
    const slots = await (session ? slotsQuery.session(session) : slotsQuery).lean();
    const slotById = new Map(slots.map((a) => [a._id.toString(), a.timeSlot]));

    // Track which appointments to update so we can sync estimated times
    const appointmentsToUpdate = [];

    waiting.forEach((entry, index) => {
      const position = index + 1; // 1 = next to be called
      const timeSlot = slotById.get(entry.appointment.toString());
      if (!timeSlot) {
        // Should be unreachable now that this query is session-aware, but
        // fail loudly and specifically rather than crashing on `.start`
        // of undefined if some future change reintroduces the gap.
        throw new ApiError(
          500,
          `Queue recalculation couldn't find the scheduled time slot for appointment ${entry.appointment}.`
        );
      }

      // Use the appointment's allocated timeSlot. Do not offset again by
      // (position - 1) * duration — that double-shifted sequential bookings
      // and, when combined with the old "snap all to now" bug, hid duplicates
      // in estimates while timeSlot.start stayed identical.
      const estStart = combineDateAndTime(date, timeSlot.start);
      const estEnd = combineDateAndTime(date, timeSlot.end);

      // Store persistent estimated consultation time for patient display
      entry.estimatedConsultationStartTime = estStart;
      entry.estimatedConsultationEndTime = estEnd;

      // Maintain legacy fields for internal calculations (not shown to patient)
      entry.queuePosition = position;
      // Legacy: estimatedReportingTime used by old display logic
      entry.estimatedReportingTime = estStart;
      // Legacy: estimatedWaitingMinutes used by old display logic
      const now = Date.now();
      entry.estimatedWaitingMinutes = Math.max(Math.round((estStart.getTime() - now) / 60000), 0);

      // Track for appointment sync
      appointmentsToUpdate.push({
        appointmentId: entry.appointment,
        estimatedConsultationStartTime: estStart,
        estimatedConsultationEndTime: estEnd,
      });
    });

    await queue.save({ session });

    // IMPORTANT: Sync estimated times back to Appointment documents.
    // This ensures patients can query their appointment and get the
    // latest estimate without relying on Socket.IO or frontend state.
    if (appointmentsToUpdate.length > 0) {
      for (const update of appointmentsToUpdate) {
        const appointmentQuery = Appointment.findByIdAndUpdate(
          update.appointmentId,
          {
            estimatedConsultationStartTime: update.estimatedConsultationStartTime,
            estimatedConsultationEndTime: update.estimatedConsultationEndTime,
          },
          { new: true }
        );
        if (session) {
          await appointmentQuery.session(session);
        } else {
          await appointmentQuery;
        }
      }
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
