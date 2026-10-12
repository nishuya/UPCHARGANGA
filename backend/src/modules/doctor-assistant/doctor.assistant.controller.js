/**
 * DOCTOR ASSISTANT CONTROLLER - CONSULTATION MANAGEMENT
 * ======================================================
 * Handles doctor/doctor-assistant operations:
 * - Call next patient
 * - Start consultation
 * - Complete consultation
 * - View queue status
 * - Skip/no-show patient
 */

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../errors/ApiError');
const Queue = require('../queue/queue.model');
const Appointment = require('../appointments/appointments.model');
const QueueService = require('../queue/queue.service');
const QueueScheduler = require('../queue/queue.scheduler.service');
const withTransaction = require('../../utils/withTransaction.util');
const {
  normalizeDateOnly,
  getHospitalNow,
} = require('../../utils/datetime.util');
const { QUEUE_ENTRY_STATUS, APPOINTMENT_STATUS } = require('../../constants/enums');

/**
 * Get the next patient to call
 * Only shows patients who are eligible (arrived and in doctor queue)
 */
const getNextPatientToCall = asyncHandler(async (req, res) => {
  const { doctorId } = req.query;

  if (!doctorId) {
    throw new ApiError(400, 'doctorId is required');
  }

  const today = normalizeDateOnly(getHospitalNow());

  const queue = await Queue.findOne({
    doctor: doctorId,
    date: today,
  })
    .populate({
      path: 'entries.patient',
      select: 'fullName phone',
    })
    .populate({
      path: 'entries.appointment',
      select: 'tokenNumber status isInDoctorQueue',
    });

  if (!queue) {
    return res.status(200).json(
      new ApiResponse(200, { nextPatient: null }, 'No queue for this doctor today.')
    );
  }

  // Find first waiting patient who is in doctor queue
  const waitingEntries = queue.entries
    .filter((e) => e.status === QUEUE_ENTRY_STATUS.WAITING)
    .sort((a, b) => a.tokenNumber - b.tokenNumber);

  if (waitingEntries.length === 0) {
    return res.status(200).json(
      new ApiResponse(200, { nextPatient: null }, 'No patients waiting.')
    );
  }

  const nextEntry = waitingEntries[0];

  // Check if patient is in doctor queue (reception has processed them)
  const appointment = await Appointment.findById(nextEntry.appointment);
  if (!appointment?.isInDoctorQueue) {
    return res.status(200).json(
      new ApiResponse(
        200,
        { nextPatient: null },
        'Next patient not yet moved to doctor queue by reception.'
      )
    );
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        nextPatient: {
          entryId: nextEntry._id,
          tokenNumber: nextEntry.tokenNumber,
          patientName: nextEntry.patient?.fullName,
          patientPhone: nextEntry.patient?.phone,
          queuePosition: nextEntry.queuePosition,
          estimatedStartTime: nextEntry.estimatedStartTime,
          scheduledStartTime: nextEntry.scheduledStartTime,
          arrivalStatus: nextEntry.arrivalStatus,
        },
      },
      'Retrieved next patient to call.'
    )
  );
});

/**
 * Call the next patient
 * Updates their queue status to 'called'
 */
const callNextPatient = asyncHandler(async (req, res) => {
  const { queueId, doctorId } = req.body;

  if (!queueId || !doctorId) {
    throw new ApiError(400, 'queueId and doctorId are required');
  }

  const result = await withTransaction(async (session) => {
    const queue = await Queue.findById(queueId).session(session);
    if (!queue) throw new ApiError(404, 'Queue not found');

    // Find next waiting patient
    const nextEntry = queue.entries
      .filter((e) => e.status === QUEUE_ENTRY_STATUS.WAITING)
      .sort((a, b) => a.tokenNumber - b.tokenNumber)[0];

    if (!nextEntry) {
      throw new ApiError(404, 'No patients waiting to be called');
    }

    // Mark as called
    nextEntry.status = QUEUE_ENTRY_STATUS.CALLED;
    nextEntry.calledAt = getHospitalNow();
    queue.currentTokenNumber = nextEntry.tokenNumber;

    await queue.save({ session });

    return {
      tokenNumber: nextEntry.tokenNumber,
      patientId: nextEntry.patient,
      entryId: nextEntry._id,
      calledAt: nextEntry.calledAt,
    };
  });

  res.status(200).json(
    new ApiResponse(
      200,
      result,
      `Called patient with token #${result.tokenNumber}`
    )
  );
});

/**
 * Start consultation with a patient
 * Records the actual start time (may differ from scheduled)
 */
const startConsultation = asyncHandler(async (req, res) => {
  const { queueId, entryId, doctorId, appointmentDate } = req.body;

  if (!queueId || !entryId || !doctorId || !appointmentDate) {
    throw new ApiError(400, 'queueId, entryId, doctorId, and appointmentDate are required');
  }

  const result = await withTransaction(async (session) => {
    const queue = await Queue.findById(queueId).session(session);
    if (!queue) throw new ApiError(404, 'Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new ApiError(404, 'Queue entry not found');

    if (entry.status !== QUEUE_ENTRY_STATUS.WAITING && entry.status !== QUEUE_ENTRY_STATUS.CALLED) {
      throw new ApiError(
        400,
        `Cannot start consultation - patient status is "${entry.status}"`
      );
    }

    // Record actual start time
    const now = getHospitalNow();
    entry.status = QUEUE_ENTRY_STATUS.IN_CONSULTATION;
    entry.consultationStartedAt = now;
    entry.actualStartDateTime = now;
    entry.actualStartTime = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    console.log('[DOCTOR] Consultation started:', {
      token: entry.tokenNumber,
      scheduledStart: entry.scheduledStartTime,
      actualStart: entry.actualStartTime,
      delay: 'will be calculated on completion',
    });

    await queue.save({ session });

    return {
      entryId: entry._id,
      tokenNumber: entry.tokenNumber,
      status: entry.status,
      actualStartTime: entry.actualStartTime,
      consultationStartedAt: entry.consultationStartedAt,
    };
  });

  res.status(200).json(
    new ApiResponse(
      200,
      result,
      `Consultation started for patient #${result.tokenNumber}`
    )
  );
});

/**
 * Complete consultation with a patient
 * Records actual end time, calculates duration, and recalculates queue
 */
const completeConsultation = asyncHandler(async (req, res) => {
  const { queueId, entryId, doctorId, appointmentDate } = req.body;

  if (!queueId || !entryId || !doctorId || !appointmentDate) {
    throw new ApiError(400, 'queueId, entryId, doctorId, and appointmentDate are required');
  }

  const result = await withTransaction(async (session) => {
    const now = getHospitalNow();
    const normalizedDate = normalizeDateOnly(new Date(appointmentDate));

    const queue = await Queue.findById(queueId).session(session);
    if (!queue) throw new ApiError(404, 'Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new ApiError(404, 'Queue entry not found');

    if (entry.status !== QUEUE_ENTRY_STATUS.IN_CONSULTATION) {
      throw new ApiError(
        400,
        `Cannot complete consultation - patient status is "${entry.status}"`
      );
    }

    // Record actual end time
    entry.status = QUEUE_ENTRY_STATUS.COMPLETED;
    entry.completedAt = now;
    entry.actualEndDateTime = now;
    entry.actualEndTime = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    // Calculate actual duration
    if (entry.actualStartDateTime) {
      const durationMs = now.getTime() - entry.actualStartDateTime.getTime();
      entry.actualDurationMinutes = Math.round(durationMs / 60000);

      // Update queue's running average (exponential moving average)
      const avg = queue.averageConsultationMinutes || 15;
      queue.averageConsultationMinutes = Math.round(
        avg * 0.7 + entry.actualDurationMinutes * 0.3
      );

      console.log('[DOCTOR] Consultation completed:', {
        token: entry.tokenNumber,
        scheduledDuration: 15, // Would come from doctor.availability
        actualDuration: entry.actualDurationMinutes,
        newAverage: queue.averageConsultationMinutes,
      });
    }

    await queue.save({ session });

    // Recalculate remaining queue based on actual doctor progress
    await QueueScheduler.recalculateQueue(doctorId, normalizedDate, session);

    return {
      entryId: entry._id,
      tokenNumber: entry.tokenNumber,
      status: entry.status,
      actualDurationMinutes: entry.actualDurationMinutes,
      newAverageConsultationMinutes: queue.averageConsultationMinutes,
      completedAt: entry.completedAt,
    };
  });

  res.status(200).json(
    new ApiResponse(
      200,
      result,
      `Consultation completed for patient #${result.tokenNumber}`
    )
  );
});

/**
 * Skip a patient (e.g., no-show or doctor decision)
 * Removes them from queue but doesn't cancel appointment
 */
const skipPatient = asyncHandler(async (req, res) => {
  const { queueId, entryId, reason } = req.body;

  if (!queueId || !entryId) {
    throw new ApiError(400, 'queueId and entryId are required');
  }

  const result = await withTransaction(async (session) => {
    const queue = await Queue.findById(queueId).session(session);
    if (!queue) throw new ApiError(404, 'Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new ApiError(404, 'Queue entry not found');

    if (![QUEUE_ENTRY_STATUS.WAITING, QUEUE_ENTRY_STATUS.CALLED].includes(entry.status)) {
      throw new ApiError(400, `Cannot skip patient with status "${entry.status}"`);
    }

    entry.status = QUEUE_ENTRY_STATUS.SKIPPED;
    entry.delayReason = reason || 'skipped';

    await queue.save({ session });

    return {
      entryId: entry._id,
      tokenNumber: entry.tokenNumber,
      status: entry.status,
      reason: reason || 'skipped',
    };
  });

  res.status(200).json(
    new ApiResponse(200, result, `Patient #${result.tokenNumber} skipped`)
  );
});

/**
 * Get current queue status (for doctor/assistant dashboard)
 */
const getQueueStatus = asyncHandler(async (req, res) => {
  const { doctorId } = req.query;

  if (!doctorId) {
    throw new ApiError(400, 'doctorId is required');
  }

  const today = normalizeDateOnly(getHospitalNow());

  const queue = await Queue.findOne({
    doctor: doctorId,
    date: today,
  })
    .populate({
      path: 'entries.patient',
      select: 'fullName phone',
    })
    .populate({
      path: 'entries.appointment',
      select: 'tokenNumber status',
    });

  if (!queue) {
    return res.status(200).json(
      new ApiResponse(200, { queue: null }, 'No queue for this doctor today.')
    );
  }

  // Categorize entries
  const waiting = queue.entries.filter((e) => e.status === QUEUE_ENTRY_STATUS.WAITING);
  const consulting = queue.entries.find((e) => e.status === QUEUE_ENTRY_STATUS.IN_CONSULTATION);
  const completed = queue.entries.filter((e) => e.status === QUEUE_ENTRY_STATUS.COMPLETED);
  const skipped = queue.entries.filter((e) => e.status === QUEUE_ENTRY_STATUS.SKIPPED);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        queueId: queue._id,
        currentlyServing: consulting
          ? {
              tokenNumber: consulting.tokenNumber,
              patientName: consulting.patient?.fullName,
              startedAt: consulting.consultationStartedAt,
              elapsedMinutes: consulting.consultationStartedAt
                ? Math.floor((getHospitalNow() - consulting.consultationStartedAt) / 60000)
                : 0,
            }
          : null,
        waitingCount: waiting.length,
        completedCount: completed.length,
        skippedCount: skipped.length,
        averageConsultationMinutes: queue.averageConsultationMinutes,
        waiting: waiting.map((e) => ({
          tokenNumber: e.tokenNumber,
          queuePosition: e.queuePosition,
          patientName: e.patient?.fullName,
          estimatedStartTime: e.estimatedStartTime,
          estimatedEndTime: e.estimatedEndTime,
        })),
      },
      'Queue status retrieved'
    )
  );
});

/**
 * Set consultation duration override
 * Doctor/assistant can adjust if they're running slower/faster
 */
const setConsultationDuration = asyncHandler(async (req, res) => {
  const { queueId, doctorId, appointmentDate, minutes } = req.body;

  if (!queueId || !doctorId || !appointmentDate || !minutes) {
    throw new ApiError(400, 'queueId, doctorId, appointmentDate, and minutes are required');
  }

  if (minutes < 1) {
    throw new ApiError(400, 'Consultation duration must be at least 1 minute');
  }

  const result = await withTransaction(async (session) => {
    const queue = await Queue.findById(queueId).session(session);
    if (!queue) throw new ApiError(404, 'Queue not found');

    const oldAverage = queue.averageConsultationMinutes;
    queue.averageConsultationMinutes = minutes;

    await queue.save({ session });

    // Recalculate all remaining estimates
    await QueueScheduler.recalculateQueue(
      doctorId,
      normalizeDateOnly(new Date(appointmentDate)),
      session
    );

    return {
      oldDuration: oldAverage,
      newDuration: minutes,
    };
  });

  res.status(200).json(
    new ApiResponse(
      200,
      result,
      `Consultation duration updated from ${result.oldDuration} to ${result.newDuration} minutes`
    )
  );
});

module.exports = {
  getNextPatientToCall,
  callNextPatient,
  startConsultation,
  completeConsultation,
  skipPatient,
  getQueueStatus,
  setConsultationDuration,
};
