const Queue = require('./queue.model');

class QueueService {
  static async getNextTokenNumber(doctorId, appointmentDate, session) {
    const options = {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      ...(session ? { session } : {})
    };

    const queue = await Queue.findOneAndUpdate(
      {
        doctor: doctorId,
        date: appointmentDate
      },
      {
        $inc: { totalTokensIssued: 1 },
        $setOnInsert: {
          doctor: doctorId,
          date: appointmentDate
        }
      },
      options
    );

    return queue.totalTokensIssued;
  }

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