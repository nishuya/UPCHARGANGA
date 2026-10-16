
const Queue = require('./queue.model');

class QueueService {
  /**
   * Atomically increments the token counter for a doctor on a date.
   * Requires a unique index on { doctor: 1, date: 1 }.
   */
  static async getNextTokenNumber(doctorId, appointmentDate, session) {
    const filter = {
      doctor: doctorId,
      date: appointmentDate,
    };

    const options = {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    };

    if (session) {
      options.session = session;
    }

    const queue = await Queue.findOneAndUpdate(
      filter,
      {
        $inc: { totalTokensIssued: 1 },
        $setOnInsert: {
          doctor: doctorId,
          date: appointmentDate,
        },
      },
      options
    );

    if (!queue) {
      throw new Error('Unable to allocate appointment token');
    }

    return queue.totalTokensIssued;
  }

  /**
   * Computes a scheduled slot from the doctor's assigned schedule.
   * daySchedule must contain startTime, endTime, and slotDurationMinutes.
   *
   * Returns { start, end } for Appointment.timeSlot.
   */
  static computeScheduledSlot(daySchedule, tokenNumber, appointmentDate) {
    if (
      !daySchedule ||
      !daySchedule.startTime ||
      !daySchedule.endTime ||
      !Number.isInteger(Number(tokenNumber)) ||
      Number(tokenNumber) < 1
    ) {
      throw new Error('Invalid doctor schedule or token number');
    }

    const duration = Number(daySchedule.slotDurationMinutes || 15);

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Invalid slot duration in doctor schedule');
    }

    const toMinutes = (time) => {
      const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);

      if (!match) {
        throw new Error(`Invalid schedule time: ${time}`);
      }

      return Number(match[1]) * 60 + Number(match[2]);
    };

    const startMinutes = toMinutes(daySchedule.startTime);
    const endMinutes = toMinutes(daySchedule.endTime);

    if (endMinutes <= startMinutes) {
      throw new Error('Doctor schedule end time must be after start time');
    }

    let slotIndex = Number(tokenNumber) - 1;

    // Use India Standard Time to determine whether today's slot has passed.
    const now = new Date();
    const istNow = new Date(now.getTime() + 330 * 60 * 1000);
    const today = `${istNow.getUTCFullYear()}-${String(
      istNow.getUTCMonth() + 1
    ).padStart(2, '0')}-${String(istNow.getUTCDate()).padStart(2, '0')}`;

    const appointmentDay = new Date(appointmentDate);
    const istAppointmentDay = new Date(
      appointmentDay.getTime() + 330 * 60 * 1000
    );
    const requestedDay = `${istAppointmentDay.getUTCFullYear()}-${String(
      istAppointmentDay.getUTCMonth() + 1
    ).padStart(2, '0')}-${String(istAppointmentDay.getUTCDate()).padStart(
      2,
      '0'
    )}`;

    if (requestedDay === today) {
      const currentMinutes =
        istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

      // Skip schedule intervals that have already passed.
      if (currentMinutes >= startMinutes) {
        const elapsedSlots = Math.floor(
          (currentMinutes - startMinutes) / duration
        ) + 1;

        slotIndex = Math.max(slotIndex, elapsedSlots);
      }
    }

    const slotStart = startMinutes + slotIndex * duration;
    const slotEnd = slotStart + duration;

    if (slotEnd > endMinutes) {
      throw new Error(
        'No appointment slots remain within the doctor’s working hours'
      );
    }

    const formatTime = (minutes) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
        minutes % 60
      ).padStart(2, '0')}`;

    return {
      start: formatTime(slotStart),
      end: formatTime(slotEnd),
    };
  }

  /**
   * Delegate queue estimates to the single scheduling engine.
   */
  static async recalculateQueue(doctorId, appointmentDate, session) {
    const QueueScheduler = require('./queue.scheduler.service');

    return QueueScheduler.recalculateQueue(
      doctorId,
      appointmentDate,
      session
    );
  }
}

const Queue = require('./queue.model');
const crypto = require('crypto');

class QueueService {
  static generateBookingNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();

    return `UG-${timestamp}-${randomPart}`;
  }

  // Keep your other methods inside this class:
  // getNextTokenNumber()
  // computeScheduledSlot()
  // recalculateQueue()
}

module.exports = QueueService;


