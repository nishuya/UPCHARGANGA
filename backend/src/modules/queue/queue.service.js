class QueueService {
  static async recalculateQueue(doctorId, appointmentDate, session) {
    const QueueScheduler = require('./queue.scheduler.service');

    return QueueScheduler.recalculateQueue(
      doctorId,
      appointmentDate,
      session
    );
  }
}

module.exports = QueueService;