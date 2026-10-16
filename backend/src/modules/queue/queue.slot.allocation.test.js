const { allocateNextTimeSlot } = require('../../utils/slotAllocation.util');
const QueueService = require('./queue.service');
const ApiError = require('../../errors/ApiError');

describe('Appointment slot allocation', () => {
  const session = { startTime: '10:00', endTime: '12:00', slotDurationMinutes: 10 };

  test('five patients with a 10-minute duration receive sequential non-overlapping slots', () => {
    const occupyingEndTimes = [];
    const slots = [];

    for (let token = 1; token <= 5; token += 1) {
      const slot = QueueService.computeScheduledSlot(session, token, new Date('2026-10-20T00:00:00.000Z'), {
        occupyingEndTimes: [...occupyingEndTimes],
        nowTimeString: '09:00',
      });
      occupyingEndTimes.push(slot.end);
      slots.push(slot);
    }

    expect(slots).toEqual([
      { start: '10:00', end: '10:10' },
      { start: '10:10', end: '10:20' },
      { start: '10:20', end: '10:30' },
      { start: '10:30', end: '10:40' },
      { start: '10:40', end: '10:50' },
    ]);
    expect(new Set(slots.map((slot) => slot.start)).size).toBe(5);
  });

  test('uses the doctor schedule duration rather than a hardcoded interval', () => {
    const twelve = { startTime: '11:00', endTime: '13:00', slotDurationMinutes: 12 };
    const occupyingEndTimes = [];
    const slots = [];

    for (let token = 1; token <= 5; token += 1) {
      const slot = QueueService.computeScheduledSlot(twelve, token, new Date('2026-10-21T00:00:00.000Z'), {
        occupyingEndTimes: [...occupyingEndTimes],
      });
      occupyingEndTimes.push(slot.end);
      slots.push(slot);
    }

    expect(slots).toEqual([
      { start: '11:00', end: '11:12' },
      { start: '11:12', end: '11:24' },
      { start: '11:24', end: '11:36' },
      { start: '11:36', end: '11:48' },
      { start: '11:48', end: '12:00' },
    ]);
  });

  test('sequential bookings never reuse an occupied end time', () => {
    const first = allocateNextTimeSlot({
      startTime: '09:00',
      endTime: '17:00',
      durationMinutes: 20,
      occupyingEndTimes: [],
    });
    const second = allocateNextTimeSlot({
      startTime: '09:00',
      endTime: '17:00',
      durationMinutes: 20,
      occupyingEndTimes: [first.end],
    });

    expect(first).toEqual({ start: '09:00', end: '09:20' });
    expect(second).toEqual({ start: '09:20', end: '09:40' });
    expect(second.start).not.toBe(first.start);
  });

  test('two allocations that do not see each other would collide — callers must persist first', () => {
    const args = {
      startTime: '09:00',
      endTime: '17:00',
      durationMinutes: 10,
      occupyingEndTimes: [],
      isToday: true,
      nowTimeString: '12:30',
    };

    const a = allocateNextTimeSlot(args);
    const b = allocateNextTimeSlot(args);
    expect(a).toEqual(b);

    const afterPersist = allocateNextTimeSlot({
      ...args,
      occupyingEndTimes: [a.end],
    });
    expect(afterPersist.start).toBe(a.end);
    expect(afterPersist.start).not.toBe(a.start);
  });

  test('same-day booking never assigns a start time earlier than now', () => {
    const slot = QueueService.computeScheduledSlot(
      { startTime: '09:00', endTime: '17:00', slotDurationMinutes: 10 },
      1,
      new Date('2026-10-16T00:00:00.000Z'),
      {
        occupyingEndTimes: [],
        nowTimeString: '12:30',
        now: new Date('2026-10-16T12:30:00.000Z'),
      }
    );

    expect(slot.start).toBe('12:30');
    expect(slot.end).toBe('12:40');
  });

  test('future-date booking ignores current time and uses the session start', () => {
    const appointmentDate = new Date('2026-10-20T00:00:00.000Z');
    const slot = QueueService.computeScheduledSlot(
      { startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15 },
      1,
      appointmentDate,
      {
        occupyingEndTimes: [],
        nowTimeString: '12:30',
        now: new Date('2026-10-16T12:30:00.000Z'),
      }
    );

    expect(slot.start).toBe('09:00');
    expect(slot.end).toBe('09:15');
  });

  test('rejects booking when no remaining session time is left', () => {
    expect(() =>
      allocateNextTimeSlot({
        startTime: '09:00',
        endTime: '17:00',
        durationMinutes: 10,
        occupyingEndTimes: ['16:55'],
        isToday: true,
        nowTimeString: '16:50',
      })
    ).toThrow(ApiError);

    try {
      allocateNextTimeSlot({
        startTime: '09:00',
        endTime: '17:00',
        durationMinutes: 10,
        occupyingEndTimes: ['16:55'],
      });
    } catch (err) {
      expect(err.statusCode).toBe(409);
      expect(err.message).toMatch(/no valid appointment slots/i);
    }
  });

  test('different doctors can independently receive the same clock time', () => {
    const doctorA = allocateNextTimeSlot({
      startTime: '10:00',
      endTime: '13:00',
      durationMinutes: 10,
      occupyingEndTimes: [],
    });
    const doctorB = allocateNextTimeSlot({
      startTime: '10:00',
      endTime: '13:00',
      durationMinutes: 10,
      occupyingEndTimes: [],
    });

    expect(doctorA).toEqual(doctorB);
  });

  test('appointments on different dates remain independent', () => {
    const monday = QueueService.computeScheduledSlot(session, 2, new Date('2026-10-19T00:00:00.000Z'), {
      occupyingEndTimes: ['10:10'],
    });
    const tuesday = QueueService.computeScheduledSlot(session, 1, new Date('2026-10-20T00:00:00.000Z'), {
      occupyingEndTimes: [],
    });

    expect(monday.start).toBe('10:10');
    expect(tuesday.start).toBe('10:00');
  });

  test('cancelled or expired slots are not occupying times so they are not chained', () => {
    const slot = QueueService.computeScheduledSlot(session, 1, new Date('2026-10-20T00:00:00.000Z'), {
      occupyingEndTimes: [],
    });
    expect(slot.start).toBe('10:00');
  });

  test('completed and in-progress appointments keep their occupying end times for new bookings', () => {
    const next = QueueService.computeScheduledSlot(session, 4, new Date('2026-10-20T00:00:00.000Z'), {
      occupyingEndTimes: ['10:10', '10:20', '10:30'],
    });
    expect(next).toEqual({ start: '10:30', end: '10:40' });
  });

  test('token order is preserved when an earlier token still occupies a grid hole', () => {
    const slot = QueueService.computeScheduledSlot(session, 3, new Date('2026-10-20T00:00:00.000Z'), {
      occupyingEndTimes: ['10:10'],
    });
    expect(slot.start).toBe('10:20');
  });

  test('same-day later booking starts after the previous assigned end, not at a copied now', () => {
    const second = QueueService.computeScheduledSlot(
      { startTime: '09:00', endTime: '17:00', slotDurationMinutes: 10 },
      2,
      new Date('2026-10-16T00:00:00.000Z'),
      {
        occupyingEndTimes: ['12:40'],
        nowTimeString: '12:32',
        now: new Date('2026-10-16T12:32:00.000Z'),
      }
    );

    expect(second).toEqual({ start: '12:40', end: '12:50' });
  });
});
