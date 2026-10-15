const Appointment = require('../appointments/appointments.model');
const Queue = require('./queue.model');
const QueueScheduler = require('./queue.scheduler.service');
const ApiError = require('../../errors/ApiError');
const { generateBookingNumber } = require('../../utils/booking.util');
const {
  normalizeDateOnly,
  addMinutesToTime,
  isTimeAfter,
  combineDateAndTime,
  datetimeToTimeString,
  getHospitalNow,
} = require('../../utils/datetime.util');
const {
  APPOINTMENT_STATUS,
  QUEUE_ENTRY_STATUS,
  QUEUE_STATUS,
  BOOKING_CONSTRAINTS,
} = require('../../constants/enums');

/**
 * QueueService — token assignment, slot math, entry transitions,
 * and delegation to QueueScheduler.recalculateQueue (the single
 * authoritative estimation engine).
 */
class QueueService {
  /** Next sequential token for a doctor/date using atomic findOneAndUpdate + upsert. */
  static async getNextTokenNumber(doctorId, date, session) {
    const normalizedDate = normalizeDateOnly(date);
    const Doctor = require('../doctors/doctors.model');
    const doctorQuery = Doctor.findById(doctorId).select('hospital department availability');
    const doctor = await (session ? doctorQuery.session(session) : doctorQuery);

    if (!doctor) {
      throw new ApiError(404, 'Doctor not found');
    }

    const daySchedule = QueueScheduler._getDaySchedule(doctor, normalizedDate);
    const defaultDuration = daySchedule?.slotDurationMinutes || 15;

    const updated = await Queue.findOneAndUpdate(
      { doctor: doctorId, date: normalizedDate },
      {
        $inc: { totalTokensIssued: 1 },
        $setOnInsert: {
          hospital: doctor.hospital,
          department: doctor.department,
          doctor: doctorId,
          date: normalizedDate,
          status: QUEUE_STATUS.ACTIVE,
          averageConsultationMinutes: defaultDuration,
          entries: [],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );

    if (!updated || !updated.totalTokensIssued) {
      throw new Error('Invalid Queue document state');
    }

    return updated.totalTokensIssued;
  }

  /**
   * Computes the initial scheduled {start, end} slot on the doctor's day grid.
   * Uses the doctor's configured slotDurationMinutes so token N gets:
   *   start = startTime + (N - 1) * slotDurationMinutes
   *   end   = start + slotDurationMinutes
   */
  static computeScheduledSlot(daySchedule, tokenNumber) {
    const duration = Number(daySchedule.slotDurationMinutes) || 15;
    if (duration < 1) {
      throw new ApiError(400, 'Invalid consultation duration configured for doctor.');
    }

    const start = addMinutesToTime(daySchedule.startTime, (tokenNumber - 1) * duration);
    const end = addMinutesToTime(start, duration);

    const effectiveEndTime = daySchedule.endTime === '00:00' ? '24:00' : daySchedule.endTime;
    const isEndAfterLimit = isTimeAfter(end, effectiveEndTime);

    if (isEndAfterLimit) {
      throw new ApiError(409, 'All slots for this doctor on the selected date are fully booked.');
    }

    return { start, end };
  }

  static generateBookingNumber(doctorId, date, tokenNumber) {
    return generateBookingNumber(doctorId, date, tokenNumber);
  }

  /**
   * Adds a new WAITING entry to the queue (preventing duplicates for the same appointment)
   * and triggers QueueScheduler.recalculateQueue.
   */
  static async addEntry(
    {
      hospitalId,
      departmentId,
      doctorId,
      date,
      appointmentId,
      patientId,
      tokenNumber,
      averageConsultationMinutes,
      timeSlot,
    },
    session
  ) {
    const normalizedDate = normalizeDateOnly(date);
    const durationMinutes = Number(averageConsultationMinutes) || 15;
    const initialStart = combineDateAndTime(normalizedDate, timeSlot.start);
    const initialEnd = combineDateAndTime(normalizedDate, timeSlot.end);
    const graceMinutes = BOOKING_CONSTRAINTS.PENDING_GRACE_PERIOD_MINUTES || 5;
    const attendanceWindowClosesDateTime = new Date(
      initialStart.getTime() + graceMinutes * 60000
    );

    const newEntry = {
      appointment: appointmentId,
      patient: patientId,
      tokenNumber,
      status: QUEUE_ENTRY_STATUS.WAITING,
      scheduledStartTime: timeSlot.start,
      scheduledEndTime: timeSlot.end,
      initialEstimatedStartTime: initialStart,
      initialEstimatedEndTime: initialEnd,
      estimatedConsultationStartTime: initialStart,
      estimatedConsultationEndTime: initialEnd,
      estimatedReportingTime: initialStart,
      estimatedStartTime: timeSlot.start,
      estimatedEndTime: timeSlot.end,
      attendanceWindowClosesAt: attendanceWindowClosesDateTime,
      arrivalStatus: 'not-arrived',
      attendanceTimeoutApplied: false,
      timingStatus: 'on-time',
      delayMinutes: 0,
      aheadMinutes: 0,
      statusLabel: 'On Time',
    };

    // Ensure we never push a duplicate entry for the same appointment
    const existingQueueQuery = Queue.findOne({ doctor: doctorId, date: normalizedDate });
    const existingQueue = await (session
      ? existingQueueQuery.session(session)
      : existingQueueQuery);

    if (existingQueue) {
      const alreadyExists = existingQueue.entries.some(
        (e) => e.appointment.toString() === appointmentId.toString()
      );
      if (!alreadyExists) {
        existingQueue.entries.push(newEntry);
        existingQueue.totalTokensIssued = Math.max(
          existingQueue.totalTokensIssued || 0,
          tokenNumber
        );
        await existingQueue.save({ session });
      }
    } else {
      await Queue.create(
        [
          {
            hospital: hospitalId,
            department: departmentId,
            doctor: doctorId,
            date: normalizedDate,
            totalTokensIssued: tokenNumber,
            averageConsultationMinutes: durationMinutes,
            status: QUEUE_STATUS.ACTIVE,
            entries: [newEntry],
          },
        ],
        { session }
      );
    }

    return QueueScheduler.recalculateQueue(doctorId, normalizedDate, session);
  }

  /**
   * Explicit configuration of consultation duration for a queue.
   * Immediately recalculates all remaining waiting patients.
   */
  static async setAverageConsultationMinutes(doctorId, date, minutes, session) {
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) {
      throw new ApiError(400, 'averageConsultationMinutes must be between 1 and 240 minutes.');
    }
    const normalizedDate = normalizeDateOnly(date);
    const queueQuery = Queue.findOne({ doctor: doctorId, date: normalizedDate });
    const queue = await (session ? queueQuery.session(session) : queueQuery);
    if (!queue) {
      throw new ApiError(404, 'No queue exists yet for this doctor on this date.');
    }
    queue.averageConsultationMinutes = minutes;
    queue.configuredConsultationMinutes = minutes;
    await queue.save({ session });
    return QueueScheduler.recalculateQueue(doctorId, normalizedDate, session);
  }

  /**
   * Delegates directly to QueueScheduler.recalculateQueue so there is
   * ONLY ONE recalculation engine in the entire application.
   */
  static async recalculateQueue(doctorId, date, session, options = {}) {
    return QueueScheduler.recalculateQueue(doctorId, date, session, options);
  }

  static findEntry(queue, appointmentId) {
    const entry = queue.entries.find(
      (e) => e.appointment.toString() === appointmentId.toString()
    );
    if (!entry) {
      throw new ApiError(404, 'Queue entry not found for this appointment.');
    }
    return entry;
  }

  static async callNext(queue, session) {
    if (queue.status !== QUEUE_STATUS.ACTIVE) {
      throw new ApiError(
        400,
        `Queue is currently "${queue.status}". Resume it before calling patients.`
      );
    }

    const activeConsultation = queue.entries.find(
      (e) => e.status === QUEUE_ENTRY_STATUS.IN_CONSULTATION
    );
    if (activeConsultation) {
      throw new ApiError(
        400,
        `Token #${activeConsultation.tokenNumber} is currently in consultation. Complete it before calling the next patient.`
      );
    }

    const waitingEntries = queue.entries
      .filter((e) => e.status === QUEUE_ENTRY_STATUS.WAITING)
      .sort((a, b) => {
        const orderA = a.reinsertOrder != null ? a.reinsertOrder : a.tokenNumber;
        const orderB = b.reinsertOrder != null ? b.reinsertOrder : b.tokenNumber;
        return orderA - orderB;
      });

    if (waitingEntries.length === 0) {
      throw new ApiError(404, 'No patients are currently waiting in the queue.');
    }

    const releasedQuery = Appointment.find(
      { _id: { $in: waitingEntries.map((e) => e.appointment) }, isInDoctorQueue: true },
      '_id'
    );
    const released = await (session ? releasedQuery.session(session) : releasedQuery).lean();
    const releasedIds = new Set(released.map((a) => a._id.toString()));

    const candidate = waitingEntries.find((e) => releasedIds.has(e.appointment.toString()));
    if (!candidate) {
      throw new ApiError(404, 'No released patients are currently waiting in the queue.');
    }

    const now = getHospitalNow();
    candidate.status = QUEUE_ENTRY_STATUS.CALLED;
    candidate.calledAt = now;
    queue.currentTokenNumber = candidate.tokenNumber;
    return candidate;
  }

  static startConsultation(entry, customNow = null) {
    const allowedStatuses = [QUEUE_ENTRY_STATUS.CALLED, QUEUE_ENTRY_STATUS.WAITING];
    if (!allowedStatuses.includes(entry.status)) {
      throw new ApiError(
        400,
        `Cannot start consultation — patient not ready (current queue status: "${entry.status}").`
      );
    }
    const now = customNow ? new Date(customNow) : getHospitalNow();
    entry.status = QUEUE_ENTRY_STATUS.IN_CONSULTATION;
    entry.consultationStartedAt = now;
    entry.actualStartDateTime = now;
    entry.actualStartTime = datetimeToTimeString(now);
    return entry;
  }

  static completeConsultation(queue, entry, customNow = null) {
    if (entry.status !== QUEUE_ENTRY_STATUS.IN_CONSULTATION) {
      throw new ApiError(
        400,
        `Cannot complete — consultation has not been started (current queue status: "${entry.status}").`
      );
    }
    const now = customNow ? new Date(customNow) : getHospitalNow();
    const startedAt = entry.actualStartDateTime || entry.consultationStartedAt || now;
    entry.status = QUEUE_ENTRY_STATUS.COMPLETED;
    entry.completedAt = now;
    entry.actualEndDateTime = now;
    entry.actualEndTime = datetimeToTimeString(now);

    const actualMinutes = Math.max(Math.round((now.getTime() - startedAt.getTime()) / 60000), 1);
    entry.actualDurationMinutes = actualMinutes;

    return { entry, actualMinutes };
  }

  static skipPatient(entry, customNow = null) {
    if (![QUEUE_ENTRY_STATUS.WAITING, QUEUE_ENTRY_STATUS.CALLED].includes(entry.status)) {
      throw new ApiError(400, `Cannot skip a patient with queue status "${entry.status}".`);
    }
    const now = customNow ? new Date(customNow) : getHospitalNow();
    entry.status = QUEUE_ENTRY_STATUS.SKIPPED;
    entry.pendingMarkedAt = now;
    entry.queuePosition = null;
    return entry;
  }

  static markPending(entry, customNow = null) {
    if (![QUEUE_ENTRY_STATUS.WAITING, QUEUE_ENTRY_STATUS.CALLED].includes(entry.status)) {
      throw new ApiError(
        400,
        `Cannot mark a patient as pending with queue status "${entry.status}".`
      );
    }
    const now = customNow ? new Date(customNow) : getHospitalNow();
    entry.status = QUEUE_ENTRY_STATUS.PENDING;
    entry.pendingMarkedAt = now;
    entry.queuePosition = null;
    return entry;
  }

  /**
   * Reinsert a PENDING or SKIPPED patient back into the active waiting sequence
   * without creating a duplicate entry.
   */
  static rejoinPatient(queue, entry, customNow = null) {
    if (![QUEUE_ENTRY_STATUS.PENDING, QUEUE_ENTRY_STATUS.SKIPPED].includes(entry.status)) {
      throw new ApiError(
        400,
        `Only pending or skipped patients can rejoin the queue (current status: "${entry.status}").`
      );
    }
    const now = customNow ? new Date(customNow) : getHospitalNow();
    entry.status = QUEUE_ENTRY_STATUS.WAITING;
    entry.rejoinedAt = now;
    entry.checkedInAt = entry.checkedInAt || now;
    entry.arrivalStatus = 'arrived-late';
    entry.attendanceTimeoutApplied = true;
    entry.delayReason = 'rejoined-after-pending';

    // Determine reinsertOrder: if tokens after this patient have already been called/completed,
    // place after any currently waiting checked-in patients that were already ready, or preserve relative order
    const highestServedToken = queue.entries
      .filter((e) =>
        [
          QUEUE_ENTRY_STATUS.CALLED,
          QUEUE_ENTRY_STATUS.IN_CONSULTATION,
          QUEUE_ENTRY_STATUS.COMPLETED,
        ].includes(e.status)
      )
      .reduce((max, e) => Math.max(max, e.tokenNumber), 0);

    if (highestServedToken > entry.tokenNumber) {
      entry.reinsertOrder = highestServedToken + 0.5;
    } else {
      entry.reinsertOrder = entry.tokenNumber;
    }

    return entry;
  }

  static pause(queue) {
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
