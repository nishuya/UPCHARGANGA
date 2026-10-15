const Queue = require('./queue.model');
const Appointment = require('../appointments/appointments.model');
const QueueService = require('./queue.service');
const QueueScheduler = require('./queue.scheduler.service');
const AttendanceTimeoutService = require('./attendance.timeout.service');
const ApiError = require('../../errors/ApiError');
const withTransaction = require('../../utils/withTransaction.util');
const { broadcastQueueRecalculation, notifyPatientCalled } = require('../../sockets/socketEmitter');
const { normalizeDateOnly, getHospitalNow } = require('../../utils/datetime.util');
const { QUEUE_ENTRY_STATUS, APPOINTMENT_STATUS } = require('../../constants/enums');

const getQueue = async (req, res) => {
  try {
    const { doctorId, date } = req.params;
    const parsedDate = normalizeDateOnly(new Date(date));

    await QueueScheduler.recalculateQueue(doctorId, parsedDate);

    const queue = await Queue.findOne({ doctor: doctorId, date: parsedDate }).populate([
      { path: 'doctor', select: 'user', populate: { path: 'user', select: 'fullName' } },
      { path: 'hospital', select: 'name' },
      { path: 'department', select: 'name' },
    ]);

    if (!queue) {
      return res.status(200).json({
        _id: null,
        doctor: doctorId,
        date: parsedDate,
        currentTokenNumber: 0,
        totalTokensIssued: 0,
        entries: [],
        status: 'active',
        averageConsultationMinutes: 15,
        queueVersion: 1,
      });
    }

    if (req.user.role === 'patient') {
      const patientId = req.user._id.toString();
      const patientEntry = queue.entries.find((e) => e.patient.toString() === patientId);

      if (!patientEntry) {
        return res.status(200).json({
          _id: queue._id,
          doctor: { user: { fullName: queue.doctor?.user?.fullName || 'Doctor' } },
          date: queue.date,
          currentTokenNumber: queue.currentTokenNumber,
          totalTokensIssued: queue.totalTokensIssued,
          entries: [],
          status: queue.status,
          averageConsultationMinutes: queue.averageConsultationMinutes,
          queueVersion: queue.queueVersion,
          timingSummary: queue.timingSummary,
        });
      }

      return res.status(200).json({
        _id: queue._id,
        doctor: { user: { fullName: queue.doctor?.user?.fullName || 'Doctor' } },
        date: queue.date,
        currentTokenNumber: queue.currentTokenNumber,
        totalTokensIssued: queue.totalTokensIssued,
        status: queue.status,
        averageConsultationMinutes: queue.averageConsultationMinutes,
        queueVersion: queue.queueVersion,
        timingSummary: queue.timingSummary,
        entries: [
          {
            _id: patientEntry._id,
            tokenNumber: patientEntry.tokenNumber,
            status: patientEntry.status,
            arrivalStatus: patientEntry.arrivalStatus,
            scheduledStartTime: patientEntry.scheduledStartTime,
            scheduledEndTime: patientEntry.scheduledEndTime,
            estimatedConsultationStartTime: patientEntry.estimatedConsultationStartTime,
            estimatedConsultationEndTime: patientEntry.estimatedConsultationEndTime,
            recommendedArrivalTime: patientEntry.recommendedArrivalTime,
            queuePosition: patientEntry.queuePosition,
            timingStatus: patientEntry.timingStatus,
            delayMinutes: patientEntry.delayMinutes,
            aheadMinutes: patientEntry.aheadMinutes,
            statusLabel: patientEntry.statusLabel,
            statusMessage: patientEntry.statusMessage,
            recommendedAction: patientEntry.recommendedAction,
            appointment: patientEntry.appointment,
          },
        ],
      });
    }

    res.status(200).json(queue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const markPatientArrived = async (req, res) => {
  try {
    const { queueId, entryId } = req.params;
    const receptionistId = req.body.receptionistId || req.user?._id;

    const result = await withTransaction(async (session) => {
      const queue = await Queue.findById(queueId).session(session);
      if (!queue) throw new ApiError(404, 'Queue not found');
      const entry = queue.entries.id(entryId);
      if (!entry) throw new ApiError(404, 'Queue entry not found');

      const { arrivalStatus } = await AttendanceTimeoutService.markArrived(
        queueId,
        entry.appointment,
        entryId,
        false,
        receptionistId,
        session
      );

      const recalculatedQueue = await QueueScheduler.recalculateQueue(
        queue.doctor,
        queue.date,
        session
      );

      return { entry, arrivalStatus, recalculatedQueue };
    });

    broadcastQueueRecalculation({
      doctorId: result.recalculatedQueue.doctor,
      date: result.recalculatedQueue.date,
      queue: result.recalculatedQueue,
    });

    return res.status(200).json({
      message: `Patient marked as ${result.arrivalStatus}`,
      entry: result.entry,
      arrivalStatus: result.arrivalStatus,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

const callNextPatient = async (req, res) => {
  try {
    const { queueId } = req.params;

    const result = await withTransaction(async (session) => {
      const queue = await Queue.findById(queueId).session(session);
      if (!queue) {
        throw new ApiError(404, 'Queue not found');
      }

      const calledEntry = await QueueService.callNext(queue, session);
      await queue.save({ session });

      const recalculatedQueue = await QueueScheduler.recalculateQueue(
        queue.doctor,
        queue.date,
        session
      );

      return { calledEntry, recalculatedQueue };
    });

    notifyPatientCalled({
      patientId: result.calledEntry.patient,
      appointmentId: result.calledEntry.appointment,
      tokenNumber: result.calledEntry.tokenNumber,
    });

    broadcastQueueRecalculation({
      doctorId: result.recalculatedQueue.doctor,
      date: result.recalculatedQueue.date,
      queue: result.recalculatedQueue,
    });

    return res.status(200).json({
      message: `Patient #${result.calledEntry.tokenNumber} called`,
      entry: result.calledEntry,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

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

      await QueueScheduler.recordConsultationStart(queueId, entryId, session);
      await Appointment.findByIdAndUpdate(
        entry.appointment,
        {
          status: APPOINTMENT_STATUS.IN_CONSULTATION,
          actualConsultationStartedAt: getHospitalNow(),
        },
        { session }
      );
      const updated = await Queue.findById(queueId).session(session);

      return { updated, entry: updated.entries.id(entryId) };
    });

    broadcastQueueRecalculation({
      doctorId: result.updated.doctor,
      date: result.updated.date,
      queue: result.updated,
    });

    return res.status(200).json({
      message: 'Consultation started',
      entry: result.entry,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

const completeConsultation = async (req, res) => {
  try {
    const { queueId, entryId } = req.params;
    const { doctorId, appointmentDate } = req.body;

    const result = await withTransaction(async (session) => {
      const { entry, recalculatedQueue } = await QueueScheduler.recordConsultationCompletion(
        queueId,
        entryId,
        doctorId,
        appointmentDate ? new Date(appointmentDate) : undefined,
        session
      );

      await Appointment.findByIdAndUpdate(
        entry.appointment,
        {
          status: APPOINTMENT_STATUS.COMPLETED,
          actualConsultationCompletedAt: entry.actualEndDateTime,
          actualConsultationDurationMinutes: entry.actualDurationMinutes,
          isInDoctorQueue: false,
        },
        { session }
      );

      return { entry, recalculatedQueue };
    });

    broadcastQueueRecalculation({
      doctorId: result.recalculatedQueue.doctor,
      date: result.recalculatedQueue.date,
      queue: result.recalculatedQueue,
    });

    return res.status(200).json({
      message: 'Consultation completed',
      entry: result.entry,
      newAverageMinutes: result.recalculatedQueue.averageConsultationMinutes,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

const skipPatient = async (req, res) => {
  try {
    const { queueId, entryId } = req.params;
    const { doctorId, appointmentDate } = req.body;

    const result = await withTransaction(async (session) => {
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

      const recalculatedQueue = await QueueScheduler.recalculateQueue(
        doctorId || queue.doctor,
        appointmentDate ? new Date(appointmentDate) : queue.date,
        session
      );

      return { entry, recalculatedQueue };
    });

    broadcastQueueRecalculation({
      doctorId: result.recalculatedQueue.doctor,
      date: result.recalculatedQueue.date,
      queue: result.recalculatedQueue,
    });

    return res.status(200).json({
      message: 'Patient skipped',
      entry: result.entry,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

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

    const recalculated = await QueueScheduler.recalculateQueue(queue.doctor, queue.date);

    broadcastQueueRecalculation({
      doctorId: queue.doctor,
      date: queue.date,
      queue: recalculated || queue,
    });

    res.status(200).json({ message: 'Queue resumed', status: queue.status });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

const getQueueStats = async (req, res) => {
  try {
    const { queueId } = req.params;

    const queue = await Queue.findById(queueId);
    if (!queue) {
      throw new ApiError(404, 'Queue not found');
    }

    const waiting = queue.entries.filter((e) => e.status === QUEUE_ENTRY_STATUS.WAITING);
    const completed = queue.entries.filter((e) => e.status === QUEUE_ENTRY_STATUS.COMPLETED);
    const consulting = queue.entries.find((e) => e.status === QUEUE_ENTRY_STATUS.IN_CONSULTATION);

    const stats = {
      totalIssued: queue.totalTokensIssued,
      currentlyServing: queue.currentTokenNumber,
      waitingCount: waiting.length,
      completedCount: completed.length,
      averageConsultationMinutes: queue.averageConsultationMinutes,
      isConsultationActive: !!consulting,
      consultingTokenNumber: consulting?.tokenNumber || null,
      queueStatus: queue.status,
      queueVersion: queue.queueVersion,
      timingSummary: queue.timingSummary,
    };

    res.status(200).json(stats);
  } catch (error) {
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
