const Queue = require('./queue.model');
const Appointment = require('../appointments/appointments.model');
const Doctor = require('../doctors/doctors.model');

const {
  normalizeDateOnly,
  getWeekdayName,
  combineDateAndTime,
  timeToMinutes,
  minutesToTime,
  formatISTTime,
  getHospitalNow,
} = require('../../utils/datetime.util');

const {
  QUEUE_ENTRY_STATUS: Q,
  APPOINTMENT_STATUS: A,
  QUEUE_STATUS,
} = require('../../constants/enums');

const ACTIVE_QUEUE_STATUSES = [
  Q.WAITING,
  Q.PENDING,
  Q.CALLED,
  Q.IN_CONSULTATION,
];

const WAITING_STATUSES = [Q.WAITING, Q.PENDING, Q.CALLED];

class QueueScheduler {
  static _getDaySchedule(doctor, appointmentDate) {
    const weekday = getWeekdayName(appointmentDate);

    return doctor.availability?.find((item) => item.day === weekday) || null;
  }

  static _roundUpToInterval(date, intervalMinutes, scheduleStart) {
    const intervalMs = intervalMinutes * 60 * 1000;
    const origin = scheduleStart.getTime();
    const value = date.getTime();

    return new Date(
      origin + Math.max(0, Math.ceil((value - origin) / intervalMs)) * intervalMs
    );
  }

  static async _expireAfterSchedule(queue, scheduleEnd, session) {
    const now = getHospitalNow();

    if (now < scheduleEnd) return false;

    let changed = false;
    const expiredAppointmentIds = [];

    for (const entry of queue.entries) {
      if (!ACTIVE_QUEUE_STATUSES.includes(entry.status)) continue;

      // Never expire a patient who is already consulting.
      if (entry.status === Q.IN_CONSULTATION) continue;

      entry.status = Q.NO_SHOW;
      entry.attendanceTimeoutApplied = true;
      entry.attendanceTimeoutAppliedAt = now;
      entry.delayReason = 'doctor-schedule-ended';
      expiredAppointmentIds.push(entry.appointment);
      changed = true;
    }

    if (expiredAppointmentIds.length) {
      await Appointment.updateMany(
        {
          _id: { $in: expiredAppointmentIds },
          status: {
            $nin: [A.COMPLETED, A.CANCELLED, A.EXPIRED],
          },
        },
        {
          $set: {
            status: A.EXPIRED,
            cutoffTime: scheduleEnd,
          },
        },
        { session }
      );
    }

    if (changed) {
      queue.status = QUEUE_STATUS.CLOSED;
      await queue.save({ session });
    }

    return changed;
  }

  static _applyPendingAttendanceTimeouts(queue, now) {
    let changed = false;

    for (const entry of queue.entries) {
      if (entry.status !== Q.WAITING) continue;
      if (entry.arrivalStatus !== 'not-arrived') continue;
      if (entry.attendanceTimeoutApplied) continue;
      if (!entry.attendanceWindowClosesAt) continue;

      if (now >= entry.attendanceWindowClosesAt) {
        entry.attendanceTimeoutApplied = true;
        entry.attendanceTimeoutAppliedAt = now;
        entry.delayReason = 'patient-not-arrived-5min-timeout';
        changed = true;
      }
    }

    return changed;
  }

  static async recalculateQueue(doctorId, appointmentDate, session) {
    const normalizedDate = normalizeDateOnly(appointmentDate);

    const queueQuery = Queue.findOne({
      doctor: doctorId,
      date: normalizedDate,
    });

    const doctorQuery = Doctor.findById(doctorId, 'availability');

    if (session) {
      queueQuery.session(session);
      doctorQuery.session(session);
    }

    const [queue, doctor] = await Promise.all([
      queueQuery,
      doctorQuery,
    ]);

    if (!queue) return null;
    if (!doctor) throw new Error('Doctor not found');

    const schedule = this._getDaySchedule(doctor, normalizedDate);

    if (!schedule) {
      throw new Error('Doctor has no availability configured for this date');
    }

    const duration = Number(schedule.slotDurationMinutes || 15);
    const scheduleStart = combineDateAndTime(normalizedDate, schedule.startTime);
    const scheduleEnd = combineDateAndTime(normalizedDate, schedule.endTime);
    const now = getHospitalNow();

    // After the working day ends, expire unserved patients and close the queue.
    const expired = await this._expireAfterSchedule(queue, scheduleEnd, session);

    if (expired || queue.status === QUEUE_STATUS.CLOSED) {
      if (session) await queue.save({ session });
      return queue;
    }

    this._applyPendingAttendanceTimeouts(queue, now);

    const waiting = queue.entries
      .filter((entry) => WAITING_STATUSES.includes(entry.status))
      .sort((a, b) => a.tokenNumber - b.tokenNumber);

    const consulting = queue.entries.find(
      (entry) => entry.status === Q.IN_CONSULTATION
    );

    // Estimate the next free time from actual progress where possible.
    let cursor;

    if (consulting?.actualStartDateTime) {
      cursor = new Date(
        consulting.actualStartDateTime.getTime() + duration * 60 * 1000
      );
    } else {
      const completed = queue.entries
        .filter(
          (entry) =>
            entry.status === Q.COMPLETED && entry.actualEndDateTime
        )
        .sort(
          (a, b) =>
            new Date(b.actualEndDateTime) - new Date(a.actualEndDateTime)
        )[0];

      if (completed) {
        cursor = new Date(completed.actualEndDateTime);
      } else {
        cursor = new Date(scheduleStart);
      }
    }

    // Do not give a same-day waiting patient an estimated start in the past.
    if (now > cursor) cursor = new Date(now);

    cursor = this._roundUpToInterval(cursor, duration, scheduleStart);

    for (let i = 0; i < waiting.length; i += 1) {
      const entry = waiting[i];

      // Preserve the booked slot as the lower bound, if it exists.
      if (entry.scheduledStartTime) {
        const bookedStart = combineDateAndTime(
          normalizedDate,
          entry.scheduledStartTime
        );

        if (bookedStart > cursor) cursor = bookedStart;
      }

      // No estimated appointment should extend past the doctor's end time.
      const end = new Date(cursor.getTime() + duration * 60 * 1000);

      if (cursor >= scheduleEnd || end > scheduleEnd) {
        entry.estimatedStartTime = null;
        entry.estimatedEndTime = null;
        entry.estimatedReportingTime = null;
        entry.estimatedConsultationStartTime = null;
        entry.estimatedConsultationEndTime = null;
        entry.estimatedWaitingMinutes = null;
        continue;
      }

      entry.queuePosition = i + 1;
      entry.estimatedStartTime = formatISTTime(cursor);
      entry.estimatedEndTime = formatISTTime(end);
      entry.estimatedReportingTime = cursor;
      entry.estimatedConsultationStartTime = cursor;
      entry.estimatedConsultationEndTime = end;
      entry.estimatedWaitingMinutes = Math.max(
        0,
        Math.ceil((cursor.getTime() - now.getTime()) / 60000)
      );

      cursor = end;
    }

    await queue.save({ session });

    // Sync estimates to the appointment records.
    for (const entry of waiting) {
      if (!entry.appointment) continue;

      await Appointment.updateOne(
        { _id: entry.appointment },
        {
          $set: {
            estimatedConsultationStartTime:
              entry.estimatedConsultationStartTime || null,
            estimatedConsultationEndTime:
              entry.estimatedConsultationEndTime || null,
            lastQueuePositionSnapshot: {
              position: entry.queuePosition ?? null,
              estimatedReportingTime:
                entry.estimatedReportingTime || null,
              estimatedWaitingMinutes:
                entry.estimatedWaitingMinutes ?? null,
              snapshotAt: now,
            },
          },
        },
        session ? { session } : {}
      );
    }

    return queue;
  }

  static async markPatientArrived(queueId, entryId, isLate = false, session) {
    const query = Queue.findById(queueId);
    if (session) query.session(session);

    const queue = await query;
    if (!queue) throw new Error('Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new Error('Queue entry not found');

    entry.arrivalStatus = isLate ? 'arrived-late' : 'arrived-on-time';
    entry.attendanceTimeoutApplied = true;
    entry.attendanceTimeoutAppliedAt = getHospitalNow();

    await queue.save(session ? { session } : {});
    return entry;
  }

  static async recordConsultationStart(queueId, entryId, session) {
    const query = Queue.findById(queueId);
    if (session) query.session(session);

    const queue = await query;
    if (!queue) throw new Error('Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new Error('Queue entry not found');

    const now = getHospitalNow();

    entry.actualStartDateTime = now;
    entry.actualStartTime = formatISTTime(now);
    entry.status = Q.IN_CONSULTATION;

    await queue.save(session ? { session } : {});
    return entry;
  }

  static async recordConsultationCompletion(
    queueId,
    entryId,
    doctorId,
    appointmentDate,
    session
  ) {
    const query = Queue.findById(queueId);
    if (session) query.session(session);

    const queue = await query;
    if (!queue) throw new Error('Queue not found');

    const entry = queue.entries.id(entryId);
    if (!entry) throw new Error('Queue entry not found');

    const now = getHospitalNow();

    entry.actualEndDateTime = now;
    entry.actualEndTime = formatISTTime(now);
    entry.status = Q.COMPLETED;
    entry.completedAt = now;

    if (entry.actualStartDateTime) {
      const durationMinutes = Math.max(
        0,
        Math.round(
          (now.getTime() - new Date(entry.actualStartDateTime).getTime()) /
            60000
        )
      );

      entry.actualDurationMinutes = durationMinutes;

      const oldAverage = Number(queue.averageConsultationMinutes || 15);
      queue.averageConsultationMinutes = Math.max(
        1,
        Math.round(oldAverage * 0.7 + durationMinutes * 0.3)
      );
    }

    await queue.save(session ? { session } : {});

    const appointmentUpdate = Appointment.updateOne(
      { _id: entry.appointment },
      {
        $set: {
          status: A.COMPLETED,
          actualConsultationCompletedAt: now,
          actualConsultationDurationMinutes:
            entry.actualDurationMinutes ?? null,
        },
      },
      session ? { session } : {}
    );

    await appointmentUpdate;
    return this.recalculateQueue(doctorId, appointmentDate, session);
  }
}

module.exports = QueueScheduler;