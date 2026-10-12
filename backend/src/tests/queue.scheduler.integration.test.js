/**
 * QUEUE SCHEDULING SYSTEM - COMPREHENSIVE INTEGRATION TESTS
 * ===========================================================
 * Tests all critical scenarios for queue scheduling, attendance, and real-time updates
 */

const mongoose = require('mongoose');
const Queue = require('../src/modules/queue/queue.model');
const Appointment = require('../src/modules/appointments/appointments.model');
const QueueService = require('../src/modules/queue/queue.service');
const QueueScheduler = require('../src/modules/queue/queue.scheduler.service');
const AttendanceTimeoutService = require('../src/modules/queue/attendance.timeout.service');
const withTransaction = require('../src/utils/withTransaction.util');
const {
  normalizeDateOnly,
  combineDateAndTime,
  addMinutesToTime,
  getHospitalNow,
} = require('../src/utils/datetime.util');

describe('Queue Scheduling System - Integration Tests', () => {
  const testDoctorId = new mongoose.Types.ObjectId();
  const testHospitalId = new mongoose.Types.ObjectId();
  const testDepartmentId = new mongoose.Types.ObjectId();
  const testDate = new Date('2026-10-20');
  const daySchedule = {
    day: 'tuesday',
    startTime: '09:00',
    endTime: '17:00',
    slotDurationMinutes: 15,
    maxPatients: 30,
  };

  beforeEach(async () => {
    // Clean up test data
    await Queue.deleteMany({ doctor: testDoctorId });
    await Appointment.deleteMany({ doctor: testDoctorId });
  });

  // ===================================================================
  // TEST 1: Six sequential patients receive unique 15-minute slots
  // ===================================================================
  test('Six sequential patients get unique sequential 15-minute slots', async () => {
    console.log('\n=== TEST 1: Sequential Slots ===\n');

    const patients = [];
    const appointments = [];
    const tokens = [];

    // Book 6 patients
    for (let i = 1; i <= 6; i++) {
      const result = await withTransaction(async (session) => {
        // Get token
        const tokenNumber = await QueueService.getNextTokenNumber(
          testDoctorId,
          testDate,
          session
        );
        tokens.push(tokenNumber);

        // Create appointment
        const slot = {
          start: addMinutesToTime('09:00', (tokenNumber - 1) * 15),
          end: addMinutesToTime('09:00', tokenNumber * 15),
        };

        const [appointment] = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: testDoctorId,
              hospital: testHospitalId,
              department: testDepartmentId,
              appointmentDate: testDate,
              timeSlot: slot,
              tokenNumber,
              bookingNumber: `BK-${testDoctorId}-${i}`,
              status: 'confirmed',
              consultationType: 'online-booking',
              reasonForVisit: 'Test booking',
              isActive: true,
            },
          ],
          { session }
        );

        // Add to queue
        await QueueService.addEntry(
          {
            hospitalId: testHospitalId,
            departmentId: testDepartmentId,
            doctorId: testDoctorId,
            date: testDate,
            appointmentId: appointment._id,
            patientId: appointment.patient,
            tokenNumber,
            averageConsultationMinutes: 15,
            timeSlot: slot,
          },
          session
        );

        return { appointment, slot };
      });

      appointments.push(result.appointment);
      patients.push(result.appointment.patient);
    }

    // Verify
    const queue = await Queue.findOne({ doctor: testDoctorId, date: testDate });

    expect(tokens).toEqual([1, 2, 3, 4, 5, 6]);
    expect(queue.entries.length).toBe(6);

    // Verify each entry has unique sequential slot
    queue.entries.forEach((entry, index) => {
      const position = index + 1;
      expect(entry.tokenNumber).toBe(position);
      expect(entry.queuePosition).toBe(position);
      expect(entry.scheduledStartTime).toBe(
        addMinutesToTime('09:00', (position - 1) * 15)
      );
      expect(entry.estimatedStartTime).toBe(entry.scheduledStartTime);
    });

    console.log('✅ All 6 patients have unique sequential slots');
  });

  // ===================================================================
  // TEST 2: Five-minute attendance timeout applied once per patient
  // ===================================================================
  test('Five-minute attendance timeout applied once (idempotent)', async () => {
    console.log('\n=== TEST 2: Attendance Timeout Idempotency ===\n');

    const result = await withTransaction(async (session) => {
      // Create 2 patients
      const entries = [];

      for (let i = 1; i <= 2; i++) {
        const tokenNumber = await QueueService.getNextTokenNumber(
          testDoctorId,
          testDate,
          session
        );

        const slot = {
          start: addMinutesToTime('09:00', (tokenNumber - 1) * 15),
          end: addMinutesToTime('09:00', tokenNumber * 15),
        };

        const [appointment] = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: testDoctorId,
              hospital: testHospitalId,
              department: testDepartmentId,
              appointmentDate: testDate,
              timeSlot: slot,
              tokenNumber,
              bookingNumber: `BK-${testDoctorId}-${i}`,
              status: 'confirmed',
              consultationType: 'online-booking',
              reasonForVisit: 'Test',
              isActive: true,
            },
          ],
          { session }
        );

        await QueueService.addEntry(
          {
            hospitalId: testHospitalId,
            departmentId: testDepartmentId,
            doctorId: testDoctorId,
            date: testDate,
            appointmentId: appointment._id,
            patientId: appointment.patient,
            tokenNumber,
            averageConsultationMinutes: 15,
            timeSlot: slot,
          },
          session
        );

        entries.push(appointment);
      }

      let queue = await Queue.findOne({ doctor: testDoctorId, date: testDate }).session(session);

      // Simulate time passing - first patient's attendance window closes
      const firstEntry = queue.entries[0];
      firstEntry.attendanceWindowClosesAt = new Date(Date.now() - 60000); // 1 minute ago

      await queue.save({ session });

      // Apply timeouts once
      await AttendanceTimeoutService.checkAndApplyTimeouts(
        testDoctorId,
        testDate,
        session
      );

      queue = await Queue.findOne({ doctor: testDoctorId, date: testDate }).session(session);
      const firstEntryAfter = queue.entries[0];

      expect(firstEntryAfter.attendanceTimeoutApplied).toBe(true);
      console.log('✅ First timeout applied');

      // Apply timeouts again - should be idempotent
      await AttendanceTimeoutService.checkAndApplyTimeouts(
        testDoctorId,
        testDate,
        session
      );

      queue = await Queue.findOne({ doctor: testDoctorId, date: testDate }).session(session);
      const firstEntrySecondRound = queue.entries[0];

      // Should still be marked as applied (not applied twice)
      expect(firstEntrySecondRound.attendanceTimeoutApplied).toBe(true);
      expect(firstEntrySecondRound.attendanceTimeoutAppliedAt).toEqual(
        firstEntryAfter.attendanceTimeoutAppliedAt
      );

      console.log('✅ Timeout is idempotent (not applied twice)');

      return queue;
    });
  });

  // ===================================================================
  // TEST 3: Doctor running late - future slots shift later
  // ===================================================================
  test('Doctor running late shifts future estimates later', async () => {
    console.log('\n=== TEST 3: Doctor Late - Cascade Delay ===\n');

    const result = await withTransaction(async (session) => {
      // Create 3 patients
      const appointments = [];

      for (let i = 1; i <= 3; i++) {
        const tokenNumber = await QueueService.getNextTokenNumber(
          testDoctorId,
          testDate,
          session
        );

        const slot = {
          start: addMinutesToTime('09:00', (tokenNumber - 1) * 15),
          end: addMinutesToTime('09:00', tokenNumber * 15),
        };

        const [appointment] = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: testDoctorId,
              hospital: testHospitalId,
              department: testDepartmentId,
              appointmentDate: testDate,
              timeSlot: slot,
              tokenNumber,
              bookingNumber: `BK-${testDoctorId}-${i}`,
              status: 'confirmed',
              consultationType: 'online-booking',
              reasonForVisit: 'Test',
              isActive: true,
            },
          ],
          { session }
        );

        await QueueService.addEntry(
          {
            hospitalId: testHospitalId,
            departmentId: testDepartmentId,
            doctorId: testDoctorId,
            date: testDate,
            appointmentId: appointment._id,
            patientId: appointment.patient,
            tokenNumber,
            averageConsultationMinutes: 15,
            timeSlot: slot,
          },
          session
        );

        appointments.push(appointment);
      }

      let queue = await Queue.findOne({
        doctor: testDoctorId,
        date: testDate,
      }).session(session);

      const originalSlots = queue.entries.map((e) => e.estimatedStartTime);
      console.log('Original slots:', originalSlots);

      // Patient 1 starts consultation 5 minutes late
      const entry1 = queue.entries[0];
      entry1.actualStartTime = '09:05';
      entry1.actualStartDateTime = combineDateAndTime(testDate, '09:05');
      entry1.status = 'in-consultation';

      await queue.save({ session });

      // Recalculate queue
      queue = await QueueScheduler.recalculateQueue(testDoctorId, testDate, session);

      const newSlots = queue.entries.map((e) => e.estimatedStartTime);
      console.log('New slots after 5min delay:', newSlots);

      // Verify slots shifted
      expect(newSlots[0]).toBe('09:05'); // Patient 1 starts at 09:05
      expect(newSlots[1]).toBe('09:20'); // Patient 2 shifted from 09:15 to 09:20
      expect(newSlots[2]).toBe('09:35'); // Patient 3 shifted from 09:30 to 09:35

      console.log('✅ Future slots shifted later due to doctor delay');

      return queue;
    });
  });

  // ===================================================================
  // TEST 4: Doctor early - future slots shift earlier
  // ===================================================================
  test('Doctor finishing early shifts future estimates earlier', async () => {
    console.log('\n=== TEST 4: Doctor Early - Bring Forward ===\n');

    const result = await withTransaction(async (session) => {
      // Create 3 patients
      for (let i = 1; i <= 3; i++) {
        const tokenNumber = await QueueService.getNextTokenNumber(
          testDoctorId,
          testDate,
          session
        );

        const slot = {
          start: addMinutesToTime('09:00', (tokenNumber - 1) * 15),
          end: addMinutesToTime('09:00', tokenNumber * 15),
        };

        const [appointment] = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: testDoctorId,
              hospital: testHospitalId,
              department: testDepartmentId,
              appointmentDate: testDate,
              timeSlot: slot,
              tokenNumber,
              bookingNumber: `BK-${testDoctorId}-${i}`,
              status: 'confirmed',
              consultationType: 'online-booking',
              reasonForVisit: 'Test',
              isActive: true,
            },
          ],
          { session }
        );

        await QueueService.addEntry(
          {
            hospitalId: testHospitalId,
            departmentId: testDepartmentId,
            doctorId: testDoctorId,
            date: testDate,
            appointmentId: appointment._id,
            patientId: appointment.patient,
            tokenNumber,
            averageConsultationMinutes: 15,
            timeSlot: slot,
          },
          session
        );
      }

      let queue = await Queue.findOne({
        doctor: testDoctorId,
        date: testDate,
      }).session(session);

      // Patient 1 consultation: 09:00 - 09:08 (only 8 minutes instead of 15)
      const entry1 = queue.entries[0];
      entry1.actualStartTime = '09:00';
      entry1.actualStartDateTime = combineDateAndTime(testDate, '09:00');
      entry1.actualEndTime = '09:08';
      entry1.actualEndDateTime = combineDateAndTime(testDate, '09:08');
      entry1.actualDurationMinutes = 8;
      entry1.status = 'completed';
      entry1.completedAt = combineDateAndTime(testDate, '09:08');

      await queue.save({ session });

      // Recalculate queue
      queue = await QueueScheduler.recalculateQueue(testDoctorId, testDate, session);

      const slots = queue.entries.map((e) => e.estimatedStartTime);
      console.log('Slots after early completion:', slots);

      // Patient 2 should start at 09:08 (7 minutes earlier than original 09:15)
      expect(slots[1]).toBe('09:08');
      // Patient 3 should start at 09:23 (7 minutes earlier than original 09:30)
      expect(slots[2]).toBe('09:23');

      console.log('✅ Future slots moved earlier due to early completion');

      return queue;
    });
  });

  // ===================================================================
  // TEST 5: Late patient arrival doesn't auto-cancel
  // ===================================================================
  test('Late patient arrival is not auto-cancelled', async () => {
    console.log('\n=== TEST 5: Late Arrival Not Cancelled ===\n');

    const result = await withTransaction(async (session) => {
      const tokenNumber = await QueueService.getNextTokenNumber(
        testDoctorId,
        testDate,
        session
      );

      const slot = {
        start: '09:00',
        end: '09:15',
      };

      const [appointment] = await Appointment.create(
        [
          {
            patient: new mongoose.Types.ObjectId(),
            doctor: testDoctorId,
            hospital: testHospitalId,
            department: testDepartmentId,
            appointmentDate: testDate,
            timeSlot: slot,
            tokenNumber,
            bookingNumber: `BK-${testDoctorId}-1`,
            status: 'confirmed',
            consultationType: 'online-booking',
            reasonForVisit: 'Test',
            isActive: true,
          },
        ],
        { session }
      );

      await QueueService.addEntry(
        {
          hospitalId: testHospitalId,
          departmentId: testDepartmentId,
          doctorId: testDoctorId,
          date: testDate,
          appointmentId: appointment._id,
          patientId: appointment.patient,
          tokenNumber,
          averageConsultationMinutes: 15,
          timeSlot: slot,
        },
        session
      );

      let queue = await Queue.findOne({
        doctor: testDoctorId,
        date: testDate,
      }).session(session);

      const entry = queue.entries[0];

      // Mark as arrived late (after attendance window)
      await AttendanceTimeoutService.markArrived(
        queue._id,
        appointment._id,
        entry._id,
        true, // wasLate
        new mongoose.Types.ObjectId(),
        session
      );

      // Verify
      queue = await Queue.findOne({
        doctor: testDoctorId,
        date: testDate,
      }).session(session);

      const updatedEntry = queue.entries[0];
      expect(updatedEntry.arrivalStatus).toBe('arrived-late');
      expect(updatedEntry.status).toBe('waiting'); // NOT cancelled

      const updatedAppointment = await Appointment.findById(appointment._id).session(session);
      expect(updatedAppointment.status).toBe('checked-in');
      expect(updatedAppointment.arrivedAt).toBeDefined();

      console.log('✅ Late patient marked as arrived, not cancelled');

      return queue;
    });
  });

  // ===================================================================
  // TEST 6: Concurrent bookings don't produce duplicate tokens
  // ===================================================================
  test('Concurrent bookings produce unique sequential tokens', async () => {
    console.log('\n=== TEST 6: Concurrent Bookings ===\n');

    const promises = Array.from({ length: 5 }, (_, i) =>
      withTransaction(async (session) => {
        const tokenNumber = await QueueService.getNextTokenNumber(
          testDoctorId,
          testDate,
          session
        );

        const slot = {
          start: addMinutesToTime('09:00', (tokenNumber - 1) * 15),
          end: addMinutesToTime('09:00', tokenNumber * 15),
        };

        const [appointment] = await Appointment.create(
          [
            {
              patient: new mongoose.Types.ObjectId(),
              doctor: testDoctorId,
              hospital: testHospitalId,
              department: testDepartmentId,
              appointmentDate: testDate,
              timeSlot: slot,
              tokenNumber,
              bookingNumber: `BK-${testDoctorId}-${i}`,
              status: 'confirmed',
              consultationType: 'online-booking',
              reasonForVisit: 'Test',
              isActive: true,
            },
          ],
          { session }
        );

        await QueueService.addEntry(
          {
            hospitalId: testHospitalId,
            departmentId: testDepartmentId,
            doctorId: testDoctorId,
            date: testDate,
            appointmentId: appointment._id,
            patientId: appointment.patient,
            tokenNumber,
            averageConsultationMinutes: 15,
            timeSlot: slot,
          },
          session
        );

        return tokenNumber;
      })
    );

    const tokens = await Promise.all(promises);
    console.log('Concurrent tokens:', tokens);

    const uniqueTokens = new Set(tokens);
    expect(uniqueTokens.size).toBe(5);
    expect([...tokens].sort()).toEqual([1, 2, 3, 4, 5]);

    console.log('✅ All concurrent bookings have unique sequential tokens');
  });
});

module.exports = {
  // Export for use in other test suites if needed
};
