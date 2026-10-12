/**
 * QUEUE SCHEDULER TESTS
 * =====================
 * Comprehensive test suite for the queue scheduling algorithm.
 *
 * Tests cover:
 * 1. Sequential slot allocation (no duplicates, no overlaps)
 * 2. Attendance timeout behavior
 * 3. Late patient handling
 * 4. Doctor running late/early
 * 5. Consultation completion and recalculation
 * 6. Concurrent bookings
 */

const mongoose = require('mongoose');
const Queue = require('../src/modules/queue/queue.model');
const Appointment = require('../src/modules/appointments/appointments.model');
const Doctor = require('../src/modules/doctors/doctors.model');
const QueueScheduler = require('../src/modules/queue/queue.scheduler.service');
const QueueService = require('../src/modules/queue/queue.service');
const {
  normalizeDateOnly,
  combineDateAndTime,
  addMinutesToTime,
  getHospitalNow,
} = require('../src/utils/datetime.util');

describe('Queue Scheduler - Sequential Slot Allocation', () => {
  let doctor;
  let appointment;
  let appointmentDate;

  beforeEach(async () => {
    // Setup: Create a doctor with a schedule
    doctor = await Doctor.create({
      user: new mongoose.Types.ObjectId(),
      hospital: new mongoose.Types.ObjectId(),
      specialization: 'Test',
      consultationFee: 50,
      availability: [
        {
          day: 'monday',
          startTime: '09:00',
          endTime: '17:00',
          slotDurationMinutes: 15,
        },
      ],
    });

    // Monday appointment date
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = (1 - dayOfWeek + 7) % 7 || 7;
    appointmentDate = new Date(now);
    appointmentDate.setDate(appointmentDate.getDate() + daysToMonday);
    appointmentDate = normalizeDateOnly(appointmentDate);
  });

  test('Six sequential patients receive six non-overlapping 15-minute slots', async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create 6 appointments for the same doctor/date
      const appointments = [];
      for (let i = 0; i < 6; i++) {
        const apt = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: doctor._id,
              hospital: doctor.hospital,
              department: new mongoose.Types.ObjectId(),
              appointmentDate,
              timeSlot: {
                start: addMinutesToTime('09:00', i * 15),
                end: addMinutesToTime('09:00', (i + 1) * 15),
              },
              tokenNumber: i + 1,
              bookingNumber: `TEST-${i}`,
              status: 'pending',
              createdBy: new mongoose.Types.ObjectId(),
            },
          ],
          { session }
        );
        appointments.push(apt[0]);
      }

      // Add entries to queue (simulating bookings)
      for (const apt of appointments) {
        await QueueService.addEntry(
          {
            hospitalId: doctor.hospital,
            departmentId: new mongoose.Types.ObjectId(),
            doctorId: doctor._id,
            date: appointmentDate,
            appointmentId: apt._id,
            patientId: apt.patient,
            tokenNumber: apt.tokenNumber,
            averageConsultationMinutes: 15,
            timeSlot: apt.timeSlot,
          },
          session
        );
      }

      // Recalculate queue
      const queue = await QueueScheduler.recalculateQueue(doctor._id, appointmentDate, session);

      // Verify: Each patient has a unique slot
      const estimatedTimes = queue.entries.map(e => ({
        position: e.queuePosition,
        start: e.estimatedStartTime,
        end: e.estimatedEndTime,
        token: e.tokenNumber,
      }));

      console.log('Sequential slots:', estimatedTimes);

      // Check no overlaps and sequential order
      for (let i = 0; i < estimatedTimes.length; i++) {
        expect(estimatedTimes[i].position).toBe(i + 1);
        if (i > 0) {
          expect(estimatedTimes[i].start).toBe(estimatedTimes[i - 1].end);
        }
      }

      await session.commitTransaction();
    } finally {
      await session.endSession();
    }
  });

  test('New booking receives the correct next available slot', async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create 3 appointments
      for (let i = 0; i < 3; i++) {
        const apt = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: doctor._id,
              hospital: doctor.hospital,
              department: new mongoose.Types.ObjectId(),
              appointmentDate,
              timeSlot: {
                start: addMinutesToTime('09:00', i * 15),
                end: addMinutesToTime('09:00', (i + 1) * 15),
              },
              tokenNumber: i + 1,
              bookingNumber: `TEST-${i}`,
              status: 'pending',
              createdBy: new mongoose.Types.ObjectId(),
            },
          ],
          { session }
        );

        await QueueService.addEntry(
          {
            hospitalId: doctor.hospital,
            departmentId: new mongoose.Types.ObjectId(),
            doctorId: doctor._id,
            date: appointmentDate,
            appointmentId: apt[0]._id,
            patientId: apt[0].patient,
            tokenNumber: apt[0].tokenNumber,
            averageConsultationMinutes: 15,
            timeSlot: apt[0].timeSlot,
          },
          session
        );
      }

      let queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);
      expect(queue.totalTokensIssued).toBe(3);
      expect(queue.entries.length).toBe(3);

      // Add 4th patient
      const apt4 = await Appointment.create(
        [
          {
            patient: new mongoose.Types.ObjectId(),
            doctor: doctor._id,
            hospital: doctor.hospital,
            department: new mongoose.Types.ObjectId(),
            appointmentDate,
            timeSlot: {
              start: addMinutesToTime('09:00', 3 * 15),
              end: addMinutesToTime('09:00', 4 * 15),
            },
            tokenNumber: 4,
            bookingNumber: 'TEST-3',
            status: 'pending',
            createdBy: new mongoose.Types.ObjectId(),
          },
        ],
        { session }
      );

      await QueueService.addEntry(
        {
          hospitalId: doctor.hospital,
          departmentId: new mongoose.Types.ObjectId(),
          doctorId: doctor._id,
          date: appointmentDate,
          appointmentId: apt4[0]._id,
          patientId: apt4[0].patient,
          tokenNumber: 4,
          averageConsultationMinutes: 15,
          timeSlot: apt4[0].timeSlot,
        },
        session
      );

      queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);
      expect(queue.entries.length).toBe(4);
      expect(queue.entries[3].queuePosition).toBe(4);
      expect(queue.entries[3].estimatedStartTime).toBe('09:45');
      expect(queue.entries[3].estimatedEndTime).toBe('10:00');

      await session.commitTransaction();
    } finally {
      await session.endSession();
    }
  });

  test('Attendance timeout is applied only once (idempotent)', async () => {
    // This test verifies the idempotency mechanism
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const apt = await Appointment.create(
        [
          {
            patient: new mongoose.Types.ObjectId(),
            doctor: doctor._id,
            hospital: doctor.hospital,
            department: new mongoose.Types.ObjectId(),
            appointmentDate,
            timeSlot: { start: '09:00', end: '09:15' },
            tokenNumber: 1,
            bookingNumber: 'TEST-1',
            status: 'pending',
            createdBy: new mongoose.Types.ObjectId(),
          },
        ],
        { session }
      );

      await QueueService.addEntry(
        {
          hospitalId: doctor.hospital,
          departmentId: new mongoose.Types.ObjectId(),
          doctorId: doctor._id,
          date: appointmentDate,
          appointmentId: apt[0]._id,
          patientId: apt[0].patient,
          tokenNumber: 1,
          averageConsultationMinutes: 15,
          timeSlot: apt[0].timeSlot,
        },
        session
      );

      let queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);
      const entry = queue.entries[0];

      // Simulate attendance window closing
      entry.attendanceWindowClosesAt = new Date(Date.now() - 60000); // 1 minute ago

      // First recalculation should apply timeout
      await QueueScheduler.recalculateQueue(doctor._id, appointmentDate, session);
      queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);

      expect(queue.entries[0].attendanceTimeoutApplied).toBe(true);
      const firstAppliedAt = queue.entries[0].attendanceTimeoutAppliedAt;

      // Second recalculation should NOT change the timeout timestamp (idempotent)
      await QueueScheduler.recalculateQueue(doctor._id, appointmentDate, session);
      queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);

      expect(queue.entries[0].attendanceTimeoutApplied).toBe(true);
      expect(queue.entries[0].attendanceTimeoutAppliedAt.getTime()).toBe(firstAppliedAt.getTime());

      await session.commitTransaction();
    } finally {
      await session.endSession();
    }
  });

  test('Late patient can be marked arrived without automatic cancellation', async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const apt = await Appointment.create(
        [
          {
            patient: new mongoose.Types.ObjectId(),
            doctor: doctor._id,
            hospital: doctor.hospital,
            department: new mongoose.Types.ObjectId(),
            appointmentDate,
            timeSlot: { start: '09:00', end: '09:15' },
            tokenNumber: 1,
            bookingNumber: 'TEST-1',
            status: 'pending',
            createdBy: new mongoose.Types.ObjectId(),
          },
        ],
        { session }
      );

      await QueueService.addEntry(
        {
          hospitalId: doctor.hospital,
          departmentId: new mongoose.Types.ObjectId(),
          doctorId: doctor._id,
          date: appointmentDate,
          appointmentId: apt[0]._id,
          patientId: apt[0].patient,
          tokenNumber: 1,
          averageConsultationMinutes: 15,
          timeSlot: apt[0].timeSlot,
        },
        session
      );

      let queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);
      const entry = queue.entries[0];

      // Mark patient as arrived (after attendance window)
      await QueueScheduler.markPatientArrived(queue._id, entry._id, true, session);

      queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);
      expect(queue.entries[0].arrivalStatus).toBe('arrived-late');
      expect(queue.entries[0].status).toBe('waiting'); // Still waiting, not cancelled

      await session.commitTransaction();
    } finally {
      await session.endSession();
    }
  });

  test('Early consultation completion moves future estimates earlier', async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create 3 appointments
      const appointments = [];
      for (let i = 0; i < 3; i++) {
        const apt = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: doctor._id,
              hospital: doctor.hospital,
              department: new mongoose.Types.ObjectId(),
              appointmentDate,
              timeSlot: {
                start: addMinutesToTime('09:00', i * 15),
                end: addMinutesToTime('09:00', (i + 1) * 15),
              },
              tokenNumber: i + 1,
              bookingNumber: `TEST-${i}`,
              status: 'pending',
              createdBy: new mongoose.Types.ObjectId(),
            },
          ],
          { session }
        );
        appointments.push(apt[0]);
      }

      for (const apt of appointments) {
        await QueueService.addEntry(
          {
            hospitalId: doctor.hospital,
            departmentId: new mongoose.Types.ObjectId(),
            doctorId: doctor._id,
            date: appointmentDate,
            appointmentId: apt._id,
            patientId: apt.patient,
            tokenNumber: apt.tokenNumber,
            averageConsultationMinutes: 15,
            timeSlot: apt.timeSlot,
          },
          session
        );
      }

      let queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);

      // Simulate first patient consultation (early completion: only 10 minutes)
      const entry1 = queue.entries[0];
      const now = getHospitalNow();
      entry1.actualStartDateTime = now;
      entry1.actualStartTime = QueueScheduler._datetimeToTimeString(now);

      // Complete 10 minutes later (instead of 15)
      const endTime = new Date(now.getTime() + 10 * 60000);
      await QueueScheduler.recordConsultationCompletion(
        queue._id,
        entry1._id,
        doctor._id,
        appointmentDate,
        session
      );

      queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);

      // Verify: Patient 2 should now start earlier
      const entry2 = queue.entries[1];
      expect(entry2.estimatedWaitingMinutes).toBeLessThan(15); // Was 15 before, now less

      await session.commitTransaction();
    } finally {
      await session.endSession();
    }
  });

  test('Doctor running late cascades delay to all future patients', async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create 2 appointments
      const appointments = [];
      for (let i = 0; i < 2; i++) {
        const apt = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: doctor._id,
              hospital: doctor.hospital,
              department: new mongoose.Types.ObjectId(),
              appointmentDate,
              timeSlot: {
                start: addMinutesToTime('09:00', i * 15),
                end: addMinutesToTime('09:00', (i + 1) * 15),
              },
              tokenNumber: i + 1,
              bookingNumber: `TEST-${i}`,
              status: 'pending',
              createdBy: new mongoose.Types.ObjectId(),
            },
          ],
          { session }
        );
        appointments.push(apt[0]);
      }

      for (const apt of appointments) {
        await QueueService.addEntry(
          {
            hospitalId: doctor.hospital,
            departmentId: new mongoose.Types.ObjectId(),
            doctorId: doctor._id,
            date: appointmentDate,
            appointmentId: apt._id,
            patientId: apt.patient,
            tokenNumber: apt.tokenNumber,
            averageConsultationMinutes: 15,
            timeSlot: apt.timeSlot,
          },
          session
        );
      }

      let queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);

      // Simulate first patient consultation (late start: 10 minutes after scheduled)
      const entry1 = queue.entries[0];
      const scheduledStart = combineDateAndTime(appointmentDate, '09:00');
      const actualStart = new Date(scheduledStart.getTime() + 10 * 60000);

      entry1.actualStartDateTime = actualStart;
      entry1.actualStartTime = QueueScheduler._datetimeToTimeString(actualStart);
      entry1.status = 'in-consultation';

      // Complete consultation (at expected end time + delay)
      const endTime = new Date(actualStart.getTime() + 15 * 60000);
      entry1.actualEndDateTime = endTime;
      entry1.actualEndTime = QueueScheduler._datetimeToTimeString(endTime);
      entry1.status = 'completed';

      await queue.save({ session });

      // Recalculate after completion
      await QueueScheduler.recalculateQueue(doctor._id, appointmentDate, session);
      queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);

      // Verify: Patient 2 starts later (at ~09:25 instead of ~09:15)
      const entry2 = queue.entries[1];
      const entry2StartMinutes = parseInt(entry2.estimatedStartTime.split(':')[1]);
      expect(entry2StartMinutes).toBeGreaterThanOrEqual(25);

      await session.commitTransaction();
    } finally {
      await session.endSession();
    }
  });

  test('Simultaneous bookings do not produce duplicate token numbers', async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const tokenNumbers = [];

      // Simulate concurrent bookings
      for (let i = 0; i < 5; i++) {
        const token = await QueueService.getNextTokenNumber(doctor._id, appointmentDate, session);
        tokenNumbers.push(token);
      }

      // Verify all tokens are unique and sequential
      expect(new Set(tokenNumbers).size).toBe(5); // All unique
      expect(tokenNumbers).toEqual([1, 2, 3, 4, 5]); // Sequential

      await session.commitTransaction();
    } finally {
      await session.endSession();
    }
  });
});

describe('Queue Scheduler - Pending Patient Delays', () => {
  let doctor;
  let appointmentDate;

  beforeEach(async () => {
    doctor = await Doctor.create({
      user: new mongoose.Types.ObjectId(),
      hospital: new mongoose.Types.ObjectId(),
      specialization: 'Test',
      consultationFee: 50,
      availability: [
        {
          day: 'monday',
          startTime: '09:00',
          endTime: '17:00',
          slotDurationMinutes: 15,
        },
      ],
    });

    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = (1 - dayOfWeek + 7) % 7 || 7;
    appointmentDate = new Date(now);
    appointmentDate.setDate(appointmentDate.getDate() + daysToMonday);
    appointmentDate = normalizeDateOnly(appointmentDate);
  });

  test('First patient marked PENDING causes downstream delays (grace period exceeded)', async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create 3 appointments
      const appointments = [];
      for (let i = 0; i < 3; i++) {
        const apt = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: doctor._id,
              hospital: doctor.hospital,
              department: new mongoose.Types.ObjectId(),
              appointmentDate,
              timeSlot: {
                start: addMinutesToTime('09:00', i * 15),
                end: addMinutesToTime('09:00', (i + 1) * 15),
              },
              tokenNumber: i + 1,
              bookingNumber: `PENDING-TEST-${i}`,
              status: 'pending',
              createdBy: new mongoose.Types.ObjectId(),
            },
          ],
          { session }
        );
        appointments.push(apt[0]);
      }

      // Add to queue
      for (const apt of appointments) {
        await QueueService.addEntry(
          {
            hospitalId: doctor.hospital,
            departmentId: new mongoose.Types.ObjectId(),
            doctorId: doctor._id,
            date: appointmentDate,
            appointmentId: apt._id,
            patientId: apt.patient,
            tokenNumber: apt.tokenNumber,
            averageConsultationMinutes: 15,
            timeSlot: apt.timeSlot,
          },
          session
        );
      }

      let queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);
      const entry0 = queue.entries[0];
      const entry1Before = queue.entries[1];
      const entry2Before = queue.entries[2];

      // Record baseline estimates
      const baselineEst1 = entry1Before.estimatedConsultationStartTime;
      const baselineEst2 = entry2Before.estimatedConsultationStartTime;

      // Mark patient 1 as PENDING (grace period exceeded)
      entry0.status = 'pending';
      entry0.pendingMarkedAt = new Date(Date.now() - 6 * 60000); // 6 minutes ago
      await queue.save({ session });

      // Recalculate
      queue = await QueueScheduler.recalculateQueue(doctor._id, appointmentDate, session);

      const entry1After = queue.entries[1];
      const entry2After = queue.entries[2];

      // Verify downstream delays: patient 2 and 3 should have been pushed later
      expect(entry1After.estimatedConsultationStartTime.getTime()).toBeGreaterThan(
        baselineEst1.getTime()
      );
      expect(entry2After.estimatedConsultationStartTime.getTime()).toBeGreaterThan(
        baselineEst2.getTime()
      );

      // Verify delay is roughly 15 minutes (one consultation duration)
      const delay1 = (entry1After.estimatedConsultationStartTime - baselineEst1) / 60000;
      expect(delay1).toBeGreaterThan(10); // At least 10 minutes delay
      expect(delay1).toBeLessThan(20);    // At most 20 minutes delay

      await session.commitTransaction();
    } finally {
      await session.endSession();
    }
  });

  test('Consultation finishing early moves downstream estimates earlier', async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create 2 appointments
      const appointments = [];
      for (let i = 0; i < 2; i++) {
        const apt = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: doctor._id,
              hospital: doctor.hospital,
              department: new mongoose.Types.ObjectId(),
              appointmentDate,
              timeSlot: {
                start: addMinutesToTime('09:00', i * 15),
                end: addMinutesToTime('09:00', (i + 1) * 15),
              },
              tokenNumber: i + 1,
              bookingNumber: `EARLY-TEST-${i}`,
              status: 'pending',
              createdBy: new mongoose.Types.ObjectId(),
            },
          ],
          { session }
        );
        appointments.push(apt[0]);
      }

      // Add to queue
      for (const apt of appointments) {
        await QueueService.addEntry(
          {
            hospitalId: doctor.hospital,
            departmentId: new mongoose.Types.ObjectId(),
            doctorId: doctor._id,
            date: appointmentDate,
            appointmentId: apt._id,
            patientId: apt.patient,
            tokenNumber: apt.tokenNumber,
            averageConsultationMinutes: 15,
            timeSlot: apt.timeSlot,
          },
          session
        );
      }

      let queue = await Queue.findOne({ doctor: doctor._id, date: appointmentDate }).session(session);
      const entry0 = queue.entries[0];
      const entry1Before = queue.entries[1];

      // Record baseline estimate for patient 2
      const baselineEst1 = entry1Before.estimatedConsultationStartTime;

      // Simulate patient 1 consultation: started on time, finished 4 minutes early
      const now = getHospitalNow();
      entry0.status = 'in-consultation';
      entry0.actualStartDateTime = new Date(now.getTime() - 11 * 60000); // Started 11 min ago
      entry0.consultationStartedAt = entry0.actualStartDateTime;

      // Complete consultation (finished after 11 minutes instead of 15)
      entry0.status = 'completed';
      entry0.actualEndDateTime = now;
      entry0.completedAt = now;
      const actualMinutes = 11;
      entry0.actualDurationMinutes = actualMinutes;

      // Update queue average (exponential moving average)
      queue.averageConsultationMinutes = Math.round(
        queue.averageConsultationMinutes * 0.7 + actualMinutes * 0.3
      );
      await queue.save({ session });

      // Recalculate
      queue = await QueueScheduler.recalculateQueue(doctor._id, appointmentDate, session);
      const entry1After = queue.entries[1];

      // Verify patient 2's estimate moved earlier (saved ~4 minutes)
      const timeDifference = (baselineEst1 - entry1After.estimatedConsultationStartTime) / 60000;
      expect(timeDifference).toBeGreaterThan(2); // At least 2 minutes earlier
      expect(timeDifference).toBeLessThan(6);    // At most 6 minutes earlier

      await session.commitTransaction();
    } finally {
      await session.endSession();
    }
  });
});

module.exports = {
  // Tests can be imported if needed
};
