const Queue = require('./queue.model');
const Appointment = require('../appointments/appointments.model');
const QueueScheduler = require('./queue.scheduler.service');
const QueueService = require('./queue.service');
const {
  getHospitalNow,
  combineDateAndTime,
  addMinutesToTime,
} = require('../../utils/datetime.util');
const { QUEUE_ENTRY_STATUS } = require('../../constants/enums');

class AttendanceTimeoutService {
  static initializeAttendanceWindow(entry, appointmentDate, scheduledStartTime) {
    const windowClosesAt = addMinutesToTime(scheduledStartTime, 5);
    const windowClosesDateTime = combineDateAndTime(appointmentDate, windowClosesAt);

    entry.attendanceWindowClosesAt = windowClosesDateTime;
    entry.arrivalStatus = 'not-arrived';
    entry.attendanceTimeoutApplied = false;

    return entry;
  }

  static async checkAndApplyTimeouts(doctorId, appointmentDate, session) {
    const queueQuery = Queue.findOne({ doctor: doctorId, date: appointmentDate });
    const queue = await (session ? queueQuery.session(session) : queueQuery);
    if (!queue) {
      return 0;
    }

    const now = getHospitalNow();
    let timeoutsApplied = 0;

    for (const entry of queue.entries) {
      if (entry.status !== QUEUE_ENTRY_STATUS.WAITING) continue;
      if (entry.attendanceTimeoutApplied) continue;
      if (!entry.attendanceWindowClosesAt) continue;

      if (now >= entry.attendanceWindowClosesAt && entry.arrivalStatus === 'not-arrived') {
        entry.attendanceTimeoutApplied = true;
        entry.attendanceTimeoutAppliedAt = now;
        entry.delayReason = 'patient-not-arrived-5min-timeout';
        timeoutsApplied++;
      }
    }

    if (timeoutsApplied > 0) {
      await queue.save({ session });
      await QueueScheduler.recalculateQueue(doctorId, appointmentDate, session);
    }

    return timeoutsApplied;
  }

  static async markArrived(
    queueId,
    appointmentId,
    entryId,
    wasLate = false,
    receptionistUserId,
    session
  ) {
    const queueQuery = Queue.findById(queueId);
    const queue = await (session ? queueQuery.session(session) : queueQuery);
    if (!queue) throw new Error('Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new Error('Queue entry not found');

    const now = getHospitalNow();
    const resolvedAppointmentId = appointmentId || entry.appointment;

    let arrivalStatus = 'arrived-on-time';
    if (
      wasLate ||
      (entry.attendanceWindowClosesAt && now > entry.attendanceWindowClosesAt) ||
      [QUEUE_ENTRY_STATUS.PENDING, QUEUE_ENTRY_STATUS.SKIPPED].includes(entry.status)
    ) {
      arrivalStatus = 'arrived-late';
    }

    if ([QUEUE_ENTRY_STATUS.PENDING, QUEUE_ENTRY_STATUS.SKIPPED].includes(entry.status)) {
      QueueService.rejoinPatient(queue, entry, now);
    } else {
      entry.checkedInAt = now;
      entry.arrivalStatus = arrivalStatus;
      entry.attendanceTimeoutApplied = true;
      entry.attendanceTimeoutAppliedAt = now;
    }

    const aptUpdateQuery = Appointment.findByIdAndUpdate(
      resolvedAppointmentId,
      {
        arrivedAt: now,
        attendanceMarkedBy: receptionistUserId,
        attendanceMarkedAt: now,
        status: 'checked-in',
      },
      { new: true }
    );
    const appointment = await (session ? aptUpdateQuery.session(session) : aptUpdateQuery);

    await queue.save({ session });

    return {
      entry,
      appointment,
      arrivalStatus,
    };
  }

  static isOverdueForArrival(entry) {
    if (!entry.attendanceWindowClosesAt) return false;
    if (entry.arrivalStatus !== 'not-arrived') return false;

    const now = getHospitalNow();
    return now >= entry.attendanceWindowClosesAt;
  }

  static getTimeRemainingForArrival(entry) {
    if (!entry.attendanceWindowClosesAt) return null;
    if (entry.arrivalStatus !== 'not-arrived') return null;

    const now = getHospitalNow();
    const remaining = entry.attendanceWindowClosesAt.getTime() - now.getTime();

    if (remaining <= 0) return 0;

    return Math.ceil(remaining / 60000);
  }
}

module.exports = AttendanceTimeoutService;
