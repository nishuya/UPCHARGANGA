/**
 * QUEUE CONTROLLER
 * ================
 * HTTP endpoints for queue operations:
 * - Retrieve current queue for a doctor/date
 * - Mark patient as arrived (reception)
 * - Call next patient (doctor assistant)
 * - Start/complete consultation (doctor assistant)
 * - Pause/resume queue (admin)
 * - Get queue statistics
 *
 * All operations trigger recalculation and broadcast via Socket.IO.
 */

const Queue = require('./queue.model');
const Appointment = require('../appointments/appointments.model');
const QueueService = require('./queue.service');
const QueueScheduler = require('./queue.scheduler.service');
const AttendanceTimeoutService = require('./attendance.timeout.service');
const ApiError = require('../../errors/ApiError');
const withTransaction = require('../../utils/withTransaction.util');
const { broadcastQueueRecalculation, notifyPatientCalled } = require('../../sockets/socketEmitter');
const { normalizeDateOnly, getHospitalNow } = require('../../utils/datetime.util');
const { QUEUE_ENTRY_STATUS } = require('../../constants/enums');

// =====================================================================
// GET QUEUE
// =====================================================================

/**
 * Get the current queue for a doctor/date with all entries
 * Used by: Reception panel, Doctor assistant, Admin dashboard, Patient portal
 *
 * SECURITY: Patients only receive their own queue entry and public queue info.
 * Staff receive full queue details only if authorized.
 */
const getQueue = async (req, res) => {
  try {
    const { doctorId, date } = req.params;
    const parsedDate = normalizeDateOnly(new Date(date));

    const queue = await Queue.findOne({ doctor: doctorId, date: parsedDate })
      .populate([
        { path: 'doctor', select: 'user', populate: { path: 'user', select: 'fullName' } },
        { path: 'hospital', select: 'name' },
        { path: 'department', select: 'name' },
      ]);

    if (!queue) {
      // No queue yet — return empty but valid structure
      return res.status(200).json({
        _id: null,
        doctor: doctorId,
        date: parsedDate,
        currentTokenNumber: 0,
        totalTokensIssued: 0,
        entries: [],
        status: 'active',
        averageConsultationMinutes: null,
      });
    }

    // SECURITY: Filter queue data based on user role
    if (req.user.role === 'patient') {
      // Patients see only their own entry + public queue progress
      const patientId = req.user._id.toString();
      const patientEntry = queue.entries.find(e => e.patient.toString() === patientId);

      if (!patientEntry) {
        // Patient has no entry in this queue — return empty/generic response
        return res.status(200).json({
          _id: queue._id,
          doctor: { user: { fullName: queue.doctor?.user?.fullName || 'Doctor' } },
          date: queue.date,
          currentTokenNumber: queue.currentTokenNumber,
          totalTokensIssued: queue.totalTokensIssued,
          entries: [],
          status: queue.status,
          averageConsultationMinutes: queue.averageConsultationMinutes,
        });
      }

      // Return only patient's own entry + aggregate queue stats
      return res.status(200).json({
        _id: queue._id,
        doctor: { user: { fullName: queue.doctor?.user?.fullName || 'Doctor' } },
        date: queue.date,
        currentTokenNumber: queue.currentTokenNumber,
        totalTokensIssued: queue.totalTokensIssued,
        status: queue.status,
        averageConsultationMinutes: queue.averageConsultationMinutes,
        // Only patient's own entry, with no other patient identifiers
        entries: [
          {
            _id: patientEntry._id,
            tokenNumber: patientEntry.tokenNumber,
            status: patientEntry.status,
            estimatedConsultationStartTime: patientEntry.estimatedConsultationStartTime,
            estimatedConsultationEndTime: patientEntry.estimatedConsultationEndTime,
            queuePosition: patientEntry.queuePosition,
            appointment: patientEntry.appointment,
          },
        ],
      });
    }

    // Staff and admin receive full queue data
    res.status(200).json(queue);
  } catch (error) {
    console.error('[QUEUE] Error fetching queue:', error);
    res.status(500).json({ error: error.message });
  }
};

// =====================================================================
// MARK PATIENT ARRIVED (Reception)
// =====================================================================

/**
 * Reception marks a patient as arrived (within or after the 5-minute window).
 * This cancels the attendance timeout for this patient and transitions from
 * PENDING (if marked) back to WAITING/CALLED. Subsequent recalculations
 * will account for the patient now being present.
 */
const markPatientArrived = async (req, res) => {
  try {
    const { queueId, entryId } = req.params;
    const { receptionistId } = req.body;

    return withTransaction(async (session) => {
      // Mark patient as arrived
      const { entry, appointment, arrivalStatus } = await AttendanceTimeoutService.markArrived(
        queueId,
        null, // appointmentId not needed for queue update
        entryId,
        false, // isLate — determined by AttendanceTimeoutService
        receptionistId,
        session
      );

      // Recalculate queue (no delay cascading for arrival alone)
      const recalculatedQueue = await QueueScheduler.recalculateQueue(
        entry.doctor || appointment.doctor,
        appointment.appointmentDate,
        session
      );

      // Broadcast updates
      broadcastQueueRecalculation({
        doctorId: recalculatedQueue.doctor,
        date: recalculatedQueue.date,
        queue: recalculatedQueue,
      });

      return res.status(200).json({
        message: `Patient marked as ${arrivalStatus}`,
        entry,
        arrivalStatus,
      });
    });
  } catch (error) {
    console.error('[QUEUE] Error marking patient arrived:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

// =====================================================================
// CALL NEXT PATIENT (Doctor Assistant)
// =====================================================================

/**
 * Doctor assistant calls the next patient in the queue.
 * This transitions the patient from WAITING → CALLED and increments currentTokenNumber.
 */
const callNextPatient = async (req, res) => {
  try {
    const { queueId } = req.params;

    const result = await withTransaction(async (session) => {
      const queue = await Queue.findById(queueId).session(session);
      if (!queue) {
        throw new ApiError(404, 'Queue not found');
      }

      const calledEntry = await QueueService.callNext(queue);
      await queue.save({ session });
      const recalculatedQueue = await QueueScheduler.recalculateQueue(
        queue.doctor,
        queue.date,
        session
      );

      // Notify patient they've been called
      notifyPatientCalled({
        patientId: calledEntry.patient,
        appointmentId: calledEntry.appointment,
        tokenNumber: calledEntry.tokenNumber,
      });

      // Broadcast queue update (currentTokenNumber changed)
      broadcastQueueRecalculation({
        doctorId: recalculatedQueue.doctor,
        date: recalculatedQueue.date,
        queue: recalculatedQueue,
      });

      return res.status(200).json({
        message: `Patient #${calledEntry.tokenNumber} called`,
        entry: calledEntry,
      });
    });
  } catch (error) {
    console.error('[QUEUE] Error calling next patient:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

// =====================================================================
// START CONSULTATION (Doctor)
// =====================================================================

/**
 * Doctor marks consultation as started.
 * Records actual start time — if different from scheduled, this cascades
 * delay to future patients on next recalculation.
 */
const startConsultation = async (req, res) => {
  try {
    const { queueId, entryId } = req.params;

    const result = await withTransaction(async (session) => {
      const queue = await Queue.findById(queueId).session(session);
      if (!queue) {
        throw new ApiError(404, 'Queue not found');
      }

      const entry = queue.entries.id(entryId);
      if (!entry) {
        throw new ApiError(404, 'Queue entry not found');
      }

      // Record actual start
      await QueueScheduler.recordConsultationStart(queueId, entryId, session);
      const recalculatedQueue = await QueueScheduler.recalculateQueue(
        queue.doctor,
        queue.date,
        session
      );

      return {
        entry: recalculatedQueue.entries.id(entryId),
        queue: recalculatedQueue,
      };
    });

    broadcastQueueRecalculation({
      doctorId: result.queue.doctor,
      date: result.queue.date,
      queue: result.queue,
    });

    return res.status(200).json({
      message: 'Consultation started',
      entry: result.entry,
    });
  } catch (error) {
    console.error('[QUEUE] Error starting consultation:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

// =====================================================================
// COMPLETE CONSULTATION (Doctor)
// =====================================================================

/**
 * Doctor marks consultation as completed.
 * Records actual end time, updates average, and recalculates future queue.
 * This is where delays (if consultation took longer) or early completions
 * (if faster) cascade to all waiting patients.
 */
const completeConsultation = async (req, res) => {
  try {
    const { queueId, entryId } = req.params;
    const { doctorId, appointmentDate } = req.body;

    return withTransaction(async (session) => {
      const { entry, recalculatedQueue } = await QueueScheduler.recordConsultationCompletion(
        queueId,
        entryId,
        doctorId,
        new Date(appointmentDate),
        session
      );

      // Broadcast updated queue with recalculated future times
      broadcastQueueRecalculation({
        doctorId,
        date: appointmentDate,
        queue: recalculatedQueue,
      });

      return res.status(200).json({
        message: 'Consultation completed',
        entry,
        newAverageMinutes: recalculatedQueue.averageConsultationMinutes,
      });
    });
  } catch (error) {
    console.error('[QUEUE] Error completing consultation:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

// =====================================================================
// SKIP PATIENT (Doctor Assistant)
// =====================================================================

/**
 * Doctor skips a patient (e.g., doesn't show, needs to be rescheduled).
 * Removes them from queue, recalculates remaining queue.
 */
const skipPatient = async (req, res) => {
  try {
    const { queueId, entryId } = req.params;
    const { doctorId, appointmentDate } = req.body;

    return withTransaction(async (session) => {
      const queue = await Queue.findById(queueId).session(session);
      if (!queue) {
        throw new ApiError(404, 'Queue not found');
      }

      const entry = queue.entries.id(entryId);
      if (!entry) {
        throw new ApiError(404, 'Queue entry not found');
      }

      QueueService.skipPatient(entry);
      await queue.save({ session });

      // Recalculate queue — moving everyone behind this patient up
      const recalculatedQueue = await QueueScheduler.recalculateQueue(
        doctorId,
        new Date(appointmentDate),
        session
      );

      broadcastQueueRecalculation({
        doctorId,
        date: appointmentDate,
        queue: recalculatedQueue,
      });

      return res.status(200).json({
        message: 'Patient skipped',
        entry,
      });
    });
  } catch (error) {
    console.error('[QUEUE] Error skipping patient:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

// =====================================================================
// PAUSE/RESUME QUEUE (Admin)
// =====================================================================

const pauseQueue = async (req, res) => {
  try {
    const { queueId } = req.params;

    const queue = await Queue.findById(queueId);
    if (!queue) {
      throw new ApiError(404, 'Queue not found');
    }

    QueueService.pause(queue);
    await queue.save();

    broadcastQueueRecalculation({
      doctorId: queue.doctor,
      date: queue.date,
      queue,
    });

    res.status(200).json({ message: 'Queue paused', status: queue.status });
  } catch (error) {
    console.error('[QUEUE] Error pausing queue:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

const resumeQueue = async (req, res) => {
  try {
    const { queueId } = req.params;

    const queue = await Queue.findById(queueId);
    if (!queue) {
      throw new ApiError(404, 'Queue not found');
    }

    QueueService.resume(queue);
    await queue.save();

    const recalculatedQueue = await QueueScheduler.recalculateQueue(queue.doctor, queue.date);
    broadcastQueueRecalculation({
      doctorId: queue.doctor,
      date: queue.date,
      queue: recalculatedQueue,
    });

    res.status(200).json({ message: 'Queue resumed', status: recalculatedQueue.status });
  } catch (error) {
    console.error('[QUEUE] Error resuming queue:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

// =====================================================================
// QUEUE STATISTICS
// =====================================================================

/**
 * Get queue statistics: avg wait time, completed, currently consulting, etc.
 */
const getQueueStats = async (req, res) => {
  try {
    const { queueId } = req.params;

    const queue = await Queue.findById(queueId);
    if (!queue) {
      throw new ApiError(404, 'Queue not found');
    }

    const waiting = queue.entries.filter(e => e.status === QUEUE_ENTRY_STATUS.WAITING);
    const completed = queue.entries.filter(e => e.status === QUEUE_ENTRY_STATUS.COMPLETED);
    const consulting = queue.entries.find(e => e.status === QUEUE_ENTRY_STATUS.IN_CONSULTATION);

    const stats = {
      totalIssued: queue.totalTokensIssued,
      currentlyServing: queue.currentTokenNumber,
      waitingCount: waiting.length,
      completedCount: completed.length,
      averageConsultationMinutes: queue.averageConsultationMinutes,
      isConsultationActive: !!consulting,
      consultingTokenNumber: consulting?.tokenNumber || null,
      queueStatus: queue.status,
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error('[QUEUE] Error fetching queue stats:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

module.exports = {
  getQueue,
  markPatientArrived,
  callNextPatient,
  startConsultation,
  completeConsultation,
  skipPatient,
  pauseQueue,
  resumeQueue,
  getQueueStats,
};
