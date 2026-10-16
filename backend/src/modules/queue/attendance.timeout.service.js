const Queue = require('./queue.model');
const QueueScheduler = require('./queue.scheduler.service');
const { getHospitalNow } = require('../../utils/datetime.util');
const { QUEUE_ENTRY_STATUS } = require('../../constants/enums');

class AttendanceTimeoutService {
  static async checkAndApplyTimeouts(doctorId, appointmentDate, session) {
    const query = Queue.findOne({
      doctor: doctorId,
      date: appointmentDate,
    });

    if (session) query.session(session);

    const queue = await query;
    if (!queue) return null;

    const now = getHospitalNow();
    let changed = false;

    for (const entry of queue.entries) {
      if (entry.status !== QUEUE_ENTRY_STATUS.WAITING) continue;
      if (entry.arrivalStatus !== 'not-arrived') continue;
      if (entry.attendanceTimeoutApplied) continue;
      if (!entry.attendanceWindowClosesAt) continue;
      if (now < entry.attendanceWindowClosesAt) continue;

      entry.attendanceTimeoutApplied = true;
      entry.attendanceTimeoutAppliedAt = now;
      entry.delayReason = 'patient-not-arrived-5min-timeout';
      changed = true;
    }

    if (changed) {
      await queue.save(session ? { session } : {});
      return QueueScheduler.recalculateQueue(
        doctorId,
        appointmentDate,
        session
      );
    }

    return queue;
  }
}

module.exports = AttendanceTimeoutService;