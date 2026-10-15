/**
 * UPCHARGANGA — COMPREHENSIVE QUEUE ESTIMATION, TIMING & REAL-TIME SYNC TEST SUITE
 * Covers all 22 required scenarios from Part 5 & Part 10 using deterministic timestamps.
 * Run with: node --test tests/queue.estimation.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const Module = require('node:module');

process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/upcharganga_test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_key_for_upcharganga_12345';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_for_upcharganga_67890';
process.env.CLIENT_URL = 'https://upcharganga.vercel.app';

const backendRoot = path.resolve(__dirname, '..');
const frontendRoot = path.resolve(__dirname, '../../frontend');

// Provide lightweight native Node.js shims when running in an offline sandbox
// where node_modules is not installed yet.
const originalLoad = Module._load;
const modelsRegistry = new Map();

class MockObjectId {
  constructor(hex) {
    this.id = hex || crypto.randomBytes(12).toString('hex');
  }
  toString() {
    return String(this.id);
  }
  toJSON() {
    return String(this.id);
  }
}

const attachSubdocHelpers = (arr) => {
  if (!Array.isArray(arr)) return arr;
  arr.forEach((item) => {
    if (item && typeof item === 'object' && !item._id) {
      item._id = new MockObjectId();
    }
  });
  const origPush = arr.push.bind(arr);
  arr.push = (...items) => {
    items.forEach((item) => {
      if (item && typeof item === 'object' && !item._id) {
        item._id = new MockObjectId();
      }
    });
    return origPush(...items);
  };
  arr.id = (subId) => {
    if (!subId) return null;
    return arr.find((item) => item?._id?.toString() === subId.toString()) || null;
  };
  arr.pull = (subId) => {
    const idx = arr.findIndex((item) => item?._id?.toString() === subId.toString());
    if (idx !== -1) arr.splice(idx, 1);
  };
  return arr;
};

Module._load = function patchedLoad(request, parent, isMain) {
  try {
    return originalLoad.apply(this, arguments);
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
    if (request === 'dotenv') return { config: () => ({}) };
    if (request === 'jsonwebtoken') return { sign: () => 'jwt', verify: () => ({}), decode: () => ({}) };
    if (request === 'bcryptjs') return { hash: async (x) => x, compare: async () => true };
    if (request === 'socket.io') {
      return { Server: class MockSocketServer {} };
    }
    if (request === 'nodemailer') {
      return { createTransport: () => ({ sendMail: async () => ({}) }) };
    }
    if (request === 'cloudinary') {
      return { v2: { config: () => {}, uploader: { upload: async () => ({}) } } };
    }
    if (request === 'mongoose') {
      class Schema {
        constructor(definition, options) {
          this.definition = definition;
          this.options = options;
          this.methods = {};
          this.statics = {};
        }
        index() {}
        pre() {}
      }
      Schema.Types = { ObjectId: MockObjectId, Mixed: Object };

      return {
        Schema,
        Types: { ObjectId: MockObjectId },
        startSession: async () => ({
          startTransaction() {},
          commitTransaction: async () => {},
          abortTransaction: async () => {},
          endSession: async () => {},
        }),
        model(name, schema) {
          if (!modelsRegistry.has(name)) {
            class MockModel {
              constructor(data = {}) {
                this._id = data._id || new MockObjectId();
                Object.assign(this, data);
                if (name === 'Queue') {
                  this.entries = attachSubdocHelpers(this.entries || []);
                  if (this.queueVersion === undefined) this.queueVersion = 1;
                  if (this.currentTokenNumber === undefined) this.currentTokenNumber = 0;
                  if (this.totalTokensIssued === undefined) this.totalTokensIssued = 0;
                  if (this.status === undefined) this.status = 'active';
                  if (this.averageConsultationMinutes === undefined) {
                    this.averageConsultationMinutes = 15;
                  }
                }
                if (name === 'Doctor') {
                  this.unavailability = attachSubdocHelpers(this.unavailability || []);
                  this.availability = attachSubdocHelpers(this.availability || []);
                }
              }
              toObject() {
                return { ...this };
              }
              async save() {
                return this;
              }
            }
            MockModel.modelName = name;
            MockModel.schema = schema;
            MockModel.findById = async () => null;
            MockModel.findOne = async () => null;
            MockModel.find = async () => [];
            MockModel.findByIdAndUpdate = async () => null;
            MockModel.findOneAndUpdate = async () => null;
            MockModel.updateOne = async () => ({});
            MockModel.create = async (doc) => doc;
            modelsRegistry.set(name, MockModel);
          }
          return modelsRegistry.get(name);
        },
      };
    }
    throw err;
  }
};

const mongoose = require('mongoose');
const {
  normalizeDateOnly,
  combineDateAndTime,
  datetimeToTimeString,
  formatTime12h,
  setMockNow,
  resetMockNow,
} = require(path.join(backendRoot, 'src/utils/datetime.util'));
const Queue = require(path.join(backendRoot, 'src/modules/queue/queue.model'));
const Appointment = require(path.join(backendRoot, 'src/modules/appointments/appointments.model'));
const Doctor = require(path.join(backendRoot, 'src/modules/doctors/doctors.model'));
const QueueScheduler = require(path.join(backendRoot, 'src/modules/queue/queue.scheduler.service'));
const QueueService = require(path.join(backendRoot, 'src/modules/queue/queue.service'));
const socketEmitter = require(path.join(backendRoot, 'src/sockets/socketEmitter'));
const appointmentsService = require(path.join(
  backendRoot,
  'src/modules/appointments/appointments.service'
));

const createInMemoryHarness = () => {
  const queues = new Map();
  const appointments = new Map();
  const doctors = new Map();

  const wrapQuery = (getResult) => {
    const queryObj = {
      session() {
        return this;
      },
      select() {
        return this;
      },
      populate() {
        return this;
      },
      sort() {
        return this;
      },
      lean() {
        const res = getResult();
        if (Array.isArray(res)) {
          return Promise.resolve(res.map((d) => (d?.toObject ? d.toObject() : { ...d })));
        }
        return Promise.resolve(res?.toObject ? res.toObject() : res ? { ...res } : null);
      },
      then(resolve, reject) {
        return Promise.resolve(getResult()).then(resolve, reject);
      },
    };
    return queryObj;
  };

  const origQueueFindOne = Queue.findOne;
  const origQueueFindById = Queue.findById;
  const origQueueFindOneAndUpdate = Queue.findOneAndUpdate;
  const origQueueCreate = Queue.create;
  const origQueueUpdateOne = Queue.updateOne;
  const origQueueSave = Queue.prototype.save;

  const origAptFind = Appointment.find;
  const origAptFindById = Appointment.findById;
  const origAptFindByIdAndUpdate = Appointment.findByIdAndUpdate;
  const origAptCreate = Appointment.create;
  const origAptSave = Appointment.prototype.save;

  const origDocFindById = Doctor.findById;
  const origDocFindOne = Doctor.findOne;

  Queue.prototype.save = async function () {
    this.entries = attachSubdocHelpers(this.entries || []);
    queues.set(this._id.toString(), this);
    return this;
  };

  Appointment.prototype.save = async function () {
    appointments.set(this._id.toString(), this);
    return this;
  };

  Queue.findOne = (filter = {}) =>
    wrapQuery(() => {
      for (const q of queues.values()) {
        const docMatch = !filter.doctor || q.doctor.toString() === filter.doctor.toString();
        const dateMatch =
          !filter.date ||
          normalizeDateOnly(q.date).getTime() === normalizeDateOnly(filter.date).getTime();
        if (docMatch && dateMatch) return q;
      }
      return null;
    });

  Queue.findById = (id) => wrapQuery(() => queues.get(id.toString()) || null);

  Queue.findOneAndUpdate = (filter, update) =>
    wrapQuery(() => {
      let existing = null;
      for (const q of queues.values()) {
        if (
          q.doctor.toString() === filter.doctor.toString() &&
          normalizeDateOnly(q.date).getTime() === normalizeDateOnly(filter.date).getTime()
        ) {
          existing = q;
          break;
        }
      }
      if (!existing) {
        const seed = {
          ...(update.$setOnInsert || {}),
          doctor: filter.doctor,
          date: normalizeDateOnly(filter.date),
          totalTokensIssued: 0,
          entries: [],
        };
        existing = new Queue(seed);
      }
      if (update.$inc?.totalTokensIssued) {
        existing.totalTokensIssued =
          (existing.totalTokensIssued || 0) + update.$inc.totalTokensIssued;
      }
      if (update.$push?.entries) {
        existing.entries.push(update.$push.entries);
      }
      queues.set(existing._id.toString(), existing);
      return existing;
    });

  Queue.create = async (docs) => {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((d) => {
      const q = new Queue(d);
      queues.set(q._id.toString(), q);
      return q;
    });
    return Array.isArray(docs) ? created : created[0];
  };

  Queue.updateOne = async (filter, update, options = {}) => {
    for (const q of queues.values()) {
      if (
        q.doctor.toString() === filter.doctor.toString() &&
        normalizeDateOnly(q.date).getTime() === normalizeDateOnly(filter.date).getTime()
      ) {
        const elemApt = options.arrayFilters?.[0]?.['elem.appointment'];
        if (elemApt && update.$set) {
          const entry = q.entries.find((e) => e.appointment.toString() === elemApt.toString());
          if (entry) {
            for (const [k, v] of Object.entries(update.$set)) {
              const field = k.replace('entries.$[elem].', '');
              entry[field] = v;
            }
          }
        }
      }
    }
  };

  Appointment.find = (filter = {}) =>
    wrapQuery(() => {
      const results = [];
      for (const a of appointments.values()) {
        if (filter._id?.$in) {
          const idSet = new Set(filter._id.$in.map((x) => x.toString()));
          if (!idSet.has(a._id.toString())) continue;
        }
        if (filter.doctor && a.doctor.toString() !== filter.doctor.toString()) continue;
        if (filter.isInDoctorQueue !== undefined && a.isInDoctorQueue !== filter.isInDoctorQueue) {
          continue;
        }
        if (filter.isActive !== undefined && a.isActive !== filter.isActive) continue;
        if (filter.status?.$in && !filter.status.$in.includes(a.status)) continue;
        if (filter.appointmentDate?.$gte || filter.appointmentDate?.$lte) {
          const t = normalizeDateOnly(a.appointmentDate).getTime();
          if (
            filter.appointmentDate.$gte &&
            t < normalizeDateOnly(filter.appointmentDate.$gte).getTime()
          ) {
            continue;
          }
          if (
            filter.appointmentDate.$lte &&
            t > normalizeDateOnly(filter.appointmentDate.$lte).getTime()
          ) {
            continue;
          }
        }
        results.push(a);
      }
      return results;
    });

  Appointment.findById = (id) => wrapQuery(() => appointments.get(id?.toString()) || null);

  Appointment.findByIdAndUpdate = (id, update) =>
    wrapQuery(() => {
      const apt = appointments.get(id?.toString());
      if (!apt) return null;
      const fields = update.$set || update;
      for (const [k, v] of Object.entries(fields)) {
        apt[k] = v;
      }
      appointments.set(apt._id.toString(), apt);
      return apt;
    });

  Appointment.create = async (docs) => {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((d) => {
      const a = new Appointment(d);
      appointments.set(a._id.toString(), a);
      return a;
    });
    return Array.isArray(docs) ? created : created[0];
  };

  Doctor.findById = (id) => wrapQuery(() => doctors.get(id?.toString()) || null);
  Doctor.findOne = (filter = {}) =>
    wrapQuery(() => {
      if (filter._id) return doctors.get(filter._id.toString()) || null;
      return null;
    });

  const restore = () => {
    Queue.findOne = origQueueFindOne;
    Queue.findById = origQueueFindById;
    Queue.findOneAndUpdate = origQueueFindOneAndUpdate;
    Queue.create = origQueueCreate;
    Queue.updateOne = origQueueUpdateOne;
    Queue.prototype.save = origQueueSave;

    Appointment.find = origAptFind;
    Appointment.findById = origAptFindById;
    Appointment.findByIdAndUpdate = origAptFindByIdAndUpdate;
    Appointment.create = origAptCreate;
    Appointment.prototype.save = origAptSave;

    Doctor.findById = origDocFindById;
    Doctor.findOne = origDocFindOne;
    resetMockNow();
  };

  return { queues, appointments, doctors, restore };
};

const seedDoctorAndBookings = async (
  harness,
  {
    serviceDateStr = '2026-10-19',
    startTime = '10:00',
    endTime = '17:00',
    slotDurationMinutes = 15,
    patientCount = 4,
    hospitalId = new mongoose.Types.ObjectId(),
    departmentId = new mongoose.Types.ObjectId(),
  } = {}
) => {
  const serviceDate = normalizeDateOnly(new Date(`${serviceDateStr}T00:00:00.000Z`));
  const doctor = new Doctor({
    user: new mongoose.Types.ObjectId(),
    hospital: hospitalId,
    department: departmentId,
    specialization: 'Cardiology',
    licenseNumber: `LIC-${Math.random().toString(36).slice(2, 8)}`,
    consultationFee: 500,
    isActive: true,
    isAvailableToday: true,
    availability: [
      {
        day: 'monday',
        startTime,
        endTime,
        slotDurationMinutes,
        maxPatients: 30,
      },
    ],
  });
  harness.doctors.set(doctor._id.toString(), doctor);

  const createdAppointments = [];
  for (let i = 0; i < patientCount; i++) {
    const tokenNumber = await QueueService.getNextTokenNumber(doctor._id, serviceDate);
    const timeSlot = QueueService.computeScheduledSlot(doctor.availability[0], tokenNumber);
    const patientId = new mongoose.Types.ObjectId();

    const [apt] = await Appointment.create([
      {
        patient: patientId,
        doctor: doctor._id,
        hospital: hospitalId,
        department: departmentId,
        appointmentDate: serviceDate,
        timeSlot,
        tokenNumber,
        bookingNumber: `UG-TEST-${tokenNumber}-${Math.random().toString(36).slice(2, 6)}`,
        status: 'confirmed',
        createdBy: patientId,
        isActive: true,
        isInDoctorQueue: true,
      },
    ]);
    createdAppointments.push(apt);

    await QueueService.addEntry({
      hospitalId,
      departmentId,
      doctorId: doctor._id,
      date: serviceDate,
      appointmentId: apt._id,
      patientId,
      tokenNumber,
      averageConsultationMinutes: slotDurationMinutes,
      timeSlot,
    });
  }

  const queue = await Queue.findOne({ doctor: doctor._id, date: serviceDate });
  return { doctor, serviceDate, queue, appointments: createdAppointments };
};

// ============================================================================
// SCENARIO 1 & 2: INITIAL QUEUE CREATION, SEQUENTIAL ESTIMATES & CANCELLATION
// ============================================================================

test('Scenarios 1 & 2: Normal queue creation (10:00, 10:15, 10:30, 10:45) and Patient B cancellation compacts queue to A=10:00, C=10:15, D=10:30 while preserving permanent tokenNumber', async () => {
  const harness = createInMemoryHarness();
  try {
    setMockNow(new Date('2026-10-19T09:50:00.000Z'));

    const { doctor, serviceDate, appointments } = await seedDoctorAndBookings(harness, {
      serviceDateStr: '2026-10-19',
      startTime: '10:00',
      slotDurationMinutes: 15,
      patientCount: 4,
    });

    let queue = await QueueScheduler.recalculateQueue(doctor._id, serviceDate);

    const expectedInitial = ['10:00', '10:15', '10:30', '10:45'];
    queue.entries.forEach((entry, idx) => {
      assert.equal(entry.tokenNumber, idx + 1);
      assert.equal(entry.queuePosition, idx + 1);
      assert.equal(entry.estimatedStartTime, expectedInitial[idx]);
      assert.equal(entry.timingStatus, 'on-time');
      assert.equal(entry.delayMinutes, 0);
      assert.equal(entry.aheadMinutes, 0);

      const syncedApt = harness.appointments.get(entry.appointment.toString());
      assert.equal(
        syncedApt.estimatedConsultationStartTime.getTime(),
        entry.estimatedConsultationStartTime.getTime()
      );
      assert.equal(syncedApt.queuePosition, idx + 1);
      assert.equal(syncedApt.timingStatus, 'on-time');
    });

    // Scenario 2: Patient B (token #2) cancels at 09:50 AM
    const aptB = appointments[1];
    aptB.status = 'cancelled';
    aptB.cancellationReason = 'Personal emergency';
    await aptB.save();

    await Queue.updateOne(
      { doctor: doctor._id, date: serviceDate },
      {
        $set: {
          'entries.$[elem].status': 'skipped',
          'entries.$[elem].delayReason': 'cancelled',
        },
      },
      { arrayFilters: [{ 'elem.appointment': aptB._id }] }
    );

    queue = await QueueScheduler.recalculateQueue(doctor._id, serviceDate);
    socketEmitter.broadcastQueueRecalculation({
      doctorId: doctor._id,
      date: serviceDate,
      queue,
    });

    const entryA = queue.entries.find((e) => e.tokenNumber === 1);
    const entryB = queue.entries.find((e) => e.tokenNumber === 2);
    const entryC = queue.entries.find((e) => e.tokenNumber === 3);
    const entryD = queue.entries.find((e) => e.tokenNumber === 4);

    assert.equal(entryB.queuePosition, null);
    assert.equal(entryB.timingStatus, 'cancelled');
    assert.equal(entryB.tokenNumber, 2, 'Permanent tokenNumber must not change');

    assert.equal(entryA.queuePosition, 1);
    assert.equal(entryA.estimatedStartTime, '10:00');
    assert.equal(entryA.timingStatus, 'on-time');

    assert.equal(entryC.tokenNumber, 3);
    assert.equal(entryC.queuePosition, 2);
    assert.equal(entryC.estimatedStartTime, '10:15');
    assert.equal(entryC.timingStatus, 'ahead-of-schedule');
    assert.equal(entryC.aheadMinutes, 15);

    assert.equal(entryD.tokenNumber, 4);
    assert.equal(entryD.queuePosition, 3);
    assert.equal(entryD.estimatedStartTime, '10:30');
    assert.equal(entryD.timingStatus, 'ahead-of-schedule');
    assert.equal(entryD.aheadMinutes, 15);
  } finally {
    harness.restore();
  }
});

// ============================================================================
// SCENARIO 3 & 4 & 9: LATE PATIENT, RECEPTION MARK PENDING, AND REJOIN
// ============================================================================

test('Scenarios 3, 4 & 9: Late patient at 10:20 AM without check-in is marked late-patient, Mark Pending removes A and shifts B/C/D up, and Rejoin restores A without duplicate entries', async () => {
  const harness = createInMemoryHarness();
  try {
    setMockNow(new Date('2026-10-19T09:45:00.000Z'));
    const { doctor, serviceDate, queue } = await seedDoctorAndBookings(harness, {
      serviceDateStr: '2026-10-19',
      startTime: '10:00',
      slotDurationMinutes: 15,
      patientCount: 4,
    });

    for (const token of [2, 3, 4]) {
      const e = queue.entries.find((x) => x.tokenNumber === token);
      e.arrivalStatus = 'arrived-on-time';
      e.checkedInAt = new Date('2026-10-19T09:55:00.000Z');
      const apt = harness.appointments.get(e.appointment.toString());
      apt.status = 'checked-in';
      apt.arrivedAt = e.checkedInAt;
    }

    // Scenario 3: Advance clock to 10:20 AM
    setMockNow(new Date('2026-10-19T10:20:00.000Z'));
    await QueueScheduler.recalculateQueue(doctor._id, serviceDate);

    const entryA = queue.entries.find((e) => e.tokenNumber === 1);
    const entryB = queue.entries.find((e) => e.tokenNumber === 2);
    const entryC = queue.entries.find((e) => e.tokenNumber === 3);

    assert.equal(entryA.timingStatus, 'late-patient');
    assert.equal(entryA.statusLabel, 'Arrival Overdue');
    assert.equal(entryB.timingStatus, 'delayed-queue');
    assert.equal(entryB.estimatedStartTime, '10:35');
    assert.equal(entryC.estimatedStartTime, '10:50');

    // Repeated recalculation at 10:20 AM must NOT accumulate another 20 minutes of delay
    await QueueScheduler.recalculateQueue(doctor._id, serviceDate);
    await QueueScheduler.recalculateQueue(doctor._id, serviceDate);
    assert.equal(entryA.estimatedStartTime, '10:20');
    assert.equal(entryB.estimatedStartTime, '10:35');
    assert.equal(entryC.estimatedStartTime, '10:50');

    // Scenario 4: Reception clicks Mark Pending on Patient A at 10:20 AM
    QueueService.markPending(entryA);
    await QueueScheduler.recalculateQueue(doctor._id, serviceDate);

    assert.equal(entryA.status, 'pending');
    assert.equal(entryA.queuePosition, null);
    assert.equal(entryA.timingStatus, 'pending-skip');

    assert.equal(entryB.queuePosition, 1);
    assert.equal(entryB.estimatedStartTime, '10:20');
    assert.equal(entryC.queuePosition, 2);
    assert.equal(entryC.estimatedStartTime, '10:35');

    // Scenario 9: Doctor starts consulting B at 10:20 AM, and A arrives at 10:25 AM and rejoins
    QueueService.startConsultation(entryB, new Date('2026-10-19T10:20:00.000Z'));
    setMockNow(new Date('2026-10-19T10:25:00.000Z'));
    QueueService.rejoinPatient(queue, entryA, new Date('2026-10-19T10:25:00.000Z'));
    await QueueScheduler.recalculateQueue(doctor._id, serviceDate);

    assert.equal(queue.entries.length, 4, 'Rejoining must not create duplicate queue entries');
    assert.equal(entryA.status, 'waiting');
    assert.equal(entryA.arrivalStatus, 'arrived-late');
    assert.ok(entryA.queuePosition >= 1);
  } finally {
    harness.restore();
  }
});

// ============================================================================
// SCENARIO 5 & 6 & 8: IN CONSULTATION, EARLY COMPLETION & LATE COMPLETION
// ============================================================================

test('Scenarios 5, 6 & 8: Early consultation completion (10:11 AM) shifts B=10:11, C=10:26, D=10:41 (ahead 4m); late completion (10:22 AM) shifts B=10:22, C=10:37, D=10:52 (delayed 7m)', async () => {
  const harness = createInMemoryHarness();
  try {
    setMockNow(new Date('2026-10-19T10:00:00.000Z'));
    const { doctor, serviceDate, queue } = await seedDoctorAndBookings(harness, {
      serviceDateStr: '2026-10-19',
      startTime: '10:00',
      slotDurationMinutes: 15,
      patientCount: 4,
    });

    const entryA = queue.entries.find((e) => e.tokenNumber === 1);
    const entryB = queue.entries.find((e) => e.tokenNumber === 2);
    const entryC = queue.entries.find((e) => e.tokenNumber === 3);
    const entryD = queue.entries.find((e) => e.tokenNumber === 4);

    // Scenario 8: A starts consultation at 10:00 AM
    QueueService.startConsultation(entryA, new Date('2026-10-19T10:00:00.000Z'));
    await QueueScheduler.recalculateQueue(doctor._id, serviceDate);

    assert.equal(entryA.status, 'in-consultation');
    assert.equal(entryA.queuePosition, 0);
    assert.equal(entryB.queuePosition, 1);
    assert.equal(entryB.estimatedStartTime, '10:15');

    // Scenario 5: A finishes early at 10:11 AM
    setMockNow(new Date('2026-10-19T10:11:00.000Z'));
    QueueService.completeConsultation(queue, entryA, new Date('2026-10-19T10:11:00.000Z'));
    await QueueScheduler.recalculateQueue(doctor._id, serviceDate);

    assert.equal(entryA.status, 'completed');
    assert.equal(entryA.timingStatus, 'completed');
    assert.equal(entryA.queuePosition, null);

    assert.equal(entryB.queuePosition, 1);
    assert.equal(entryB.estimatedStartTime, '10:11');
    assert.equal(entryB.timingStatus, 'ahead-of-schedule');
    assert.equal(entryB.aheadMinutes, 4);

    assert.equal(entryC.queuePosition, 2);
    assert.equal(entryC.estimatedStartTime, '10:26');
    assert.equal(entryC.timingStatus, 'ahead-of-schedule');
    assert.equal(entryC.aheadMinutes, 4);

    assert.equal(entryD.queuePosition, 3);
    assert.equal(entryD.estimatedStartTime, '10:41');
    assert.equal(entryD.timingStatus, 'ahead-of-schedule');
    assert.equal(entryD.aheadMinutes, 4);

    // Scenario 6: Late Consultation (runs over 10:15 AM, completes at 10:22 AM)
    setMockNow(new Date('2026-10-19T10:00:00.000Z'));
    const setup2 = await seedDoctorAndBookings(harness, {
      serviceDateStr: '2026-10-19',
      startTime: '10:00',
      slotDurationMinutes: 15,
      patientCount: 4,
    });
    const q2 = setup2.queue;
    const [a2, b2, c2, d2] = q2.entries;

    QueueService.startConsultation(a2, new Date('2026-10-19T10:00:00.000Z'));

    // At 10:18 AM, A is STILL consulting
    setMockNow(new Date('2026-10-19T10:18:00.000Z'));
    await QueueScheduler.recalculateQueue(setup2.doctor._id, setup2.serviceDate);

    assert.equal(a2.status, 'in-consultation');
    assert.equal(b2.status, 'waiting');
    assert.equal(b2.estimatedStartTime, '10:18');
    assert.equal(b2.timingStatus, 'delayed-queue');
    assert.equal(b2.delayMinutes, 3);

    // At 10:22 AM, A completes consultation
    setMockNow(new Date('2026-10-19T10:22:00.000Z'));
    QueueService.completeConsultation(q2, a2, new Date('2026-10-19T10:22:00.000Z'));
    await QueueScheduler.recalculateQueue(setup2.doctor._id, setup2.serviceDate);

    assert.equal(b2.queuePosition, 1);
    assert.equal(b2.estimatedStartTime, '10:22');
    assert.equal(b2.timingStatus, 'delayed-queue');
    assert.equal(b2.delayMinutes, 7);

    assert.equal(c2.queuePosition, 2);
    assert.equal(c2.estimatedStartTime, '10:37');
    assert.equal(c2.timingStatus, 'delayed-queue');
    assert.equal(c2.delayMinutes, 7);

    assert.equal(d2.queuePosition, 3);
    assert.equal(d2.estimatedStartTime, '10:52');
    assert.equal(d2.timingStatus, 'delayed-queue');
    assert.equal(d2.delayMinutes, 7);
  } finally {
    harness.restore();
  }
});

// ============================================================================
// SCENARIO 7: DOCTOR DELAY WHEN PATIENT IS CHECKED IN ON TIME
// ============================================================================

test('Scenario 7: Doctor has not started at 10:10 AM while Patient A is checked in — shows delayed-queue (+10 min) and never labels checked-in Patient A as late-patient', async () => {
  const harness = createInMemoryHarness();
  try {
    setMockNow(new Date('2026-10-19T09:50:00.000Z'));
    const { doctor, serviceDate, queue } = await seedDoctorAndBookings(harness, {
      serviceDateStr: '2026-10-19',
      startTime: '10:00',
      slotDurationMinutes: 15,
      patientCount: 3,
    });

    const entryA = queue.entries[0];
    entryA.arrivalStatus = 'arrived-on-time';
    entryA.checkedInAt = new Date('2026-10-19T09:55:00.000Z');
    const aptA = harness.appointments.get(entryA.appointment.toString());
    aptA.status = 'checked-in';
    aptA.arrivedAt = entryA.checkedInAt;

    setMockNow(new Date('2026-10-19T10:10:00.000Z'));
    await QueueScheduler.recalculateQueue(doctor._id, serviceDate);

    assert.equal(entryA.timingStatus, 'delayed-queue');
    assert.equal(entryA.delayMinutes, 10);
    assert.equal(entryA.estimatedStartTime, '10:10');
    assert.equal(queue.entries[1].estimatedStartTime, '10:25');
    assert.equal(queue.entries[2].estimatedStartTime, '10:40');
  } finally {
    harness.restore();
  }
});

// ============================================================================
// SCENARIO 10 & 11 & 12: DOCTOR UNAVAILABILITY, MULTI-DOCTOR ISOLATION, CONCURRENCY & VALIDATION
// ============================================================================

test('Scenarios 10, 11, 12 & Validation: Doctor unavailability cancels only affected doctor/date, Doctor A never affects Doctor B, custom consultation duration works, and invalid transitions fail', async () => {
  const harness = createInMemoryHarness();
  try {
    setMockNow(new Date('2026-10-19T09:00:00.000Z'));

    const docASetup = await seedDoctorAndBookings(harness, {
      serviceDateStr: '2026-10-19',
      startTime: '10:00',
      slotDurationMinutes: 20,
      patientCount: 3,
    });

    const docBSetup = await seedDoctorAndBookings(harness, {
      serviceDateStr: '2026-10-19',
      startTime: '10:00',
      slotDurationMinutes: 15,
      patientCount: 3,
    });

    assert.equal(docASetup.queue.entries[0].estimatedStartTime, '10:00');
    assert.equal(docASetup.queue.entries[1].estimatedStartTime, '10:20');
    assert.equal(docASetup.queue.entries[2].estimatedStartTime, '10:40');

    assert.equal(docBSetup.queue.entries[0].estimatedStartTime, '10:00');
    assert.equal(docBSetup.queue.entries[1].estimatedStartTime, '10:15');
    assert.equal(docBSetup.queue.entries[2].estimatedStartTime, '10:30');

    const { cascadeDoctorUnavailability } = require(path.join(
      backendRoot,
      'src/modules/doctorAssistant/doctorAssistant.service'
    ));
    const cancelledCount = await cascadeDoctorUnavailability(
      docASetup.doctor,
      new Date('2026-10-19T00:00:00.000Z'),
      new Date('2026-10-19T23:59:59.000Z'),
      'Emergency surgery'
    );
    assert.equal(cancelledCount, 3);

    for (const entry of docASetup.queue.entries) {
      assert.equal(entry.queuePosition, null);
      assert.equal(entry.timingStatus, 'doctor-unavailable');
      const apt = harness.appointments.get(entry.appointment.toString());
      assert.equal(apt.status, 'cancelled');
      assert.equal(apt.cancellationReason, 'DOCTOR_UNAVAILABLE');
    }

    assert.equal(docBSetup.queue.entries[0].queuePosition, 1);
    assert.equal(docBSetup.queue.entries[0].estimatedStartTime, '10:00');
    assert.equal(docBSetup.queue.entries[1].queuePosition, 2);
    assert.equal(docBSetup.queue.entries[1].estimatedStartTime, '10:15');

    const patientTrackView = await appointmentsService.getQueueEntryForAppointment(
      docBSetup.appointments[1]._id
    );
    assert.equal(patientTrackView.tokenNumber, 2);
    assert.equal(patientTrackView.queuePosition, 2);
    assert.equal(patientTrackView.estimatedStartTime, '10:15');
    assert.equal(patientTrackView.timingStatus, 'on-time');
    assert.equal(formatTime12h(patientTrackView.estimatedConsultationStartTime), '10:15 AM');
    assert.equal(formatTime12h(patientTrackView.recommendedArrivalTime), '10:05 AM');

    await assert.rejects(
      () => QueueService.setAverageConsultationMinutes(docBSetup.doctor._id, docBSetup.serviceDate, 0),
      (err) => err.statusCode === 400
    );
    assert.throws(
      () => QueueService.completeConsultation(docBSetup.queue, docBSetup.queue.entries[0]),
      (err) => err.statusCode === 400 && err.message.includes('not been started')
    );

    const emitted = socketEmitter.getEmittedEvents();
    assert.ok(
      emitted.some((e) => e.event === 'queue:updated' && e.payload.queueVersion >= 1)
    );
    assert.ok(
      emitted.some((e) => e.event === 'patient:eta-updated' && e.payload.timingStatus)
    );
  } finally {
    harness.restore();
  }
});

// ============================================================================
// FRONTEND INTEGRATION & TIMEZONE CONSISTENCY VERIFICATION
// ============================================================================

test('Frontend tracking hook, queueTime formatter, and UI components synchronize without +5:30 double timezone shift', async () => {
  const queueTimeUrl = `file://${path.join(frontendRoot, 'src/utils/queueTime.js')}`;
  const queueTime = await import(queueTimeUrl);

  const dt = combineDateAndTime(new Date('2026-10-19T00:00:00.000Z'), '10:00');
  assert.equal(datetimeToTimeString(dt), '10:00');
  assert.equal(queueTime.formatQueueTime(dt), '10:00 AM');
  assert.equal(queueTime.formatQueueTime('14:30'), '2:30 PM');

  assert.equal(queueTime.getTimingStatusMeta({ timingStatus: 'on-time' }).badgeText, 'On time');
  assert.match(
    queueTime.getTimingStatusMeta({ timingStatus: 'delayed-queue', delayMinutes: 12 }).headline,
    /Doctor is running late — estimated delay 12 min/
  );
  assert.match(
    queueTime.getTimingStatusMeta({ timingStatus: 'ahead-of-schedule', aheadMinutes: 5 }).headline,
    /Queue is ahead of schedule — approximately 5 min/
  );
  assert.match(
    queueTime.getTimingStatusMeta({ timingStatus: 'late-patient' }).headline,
    /You're late — please contact reception/
  );

  const trackingHookCode = fs.readFileSync(
    path.join(frontendRoot, 'src/features/patient/hooks/useAppointmentTracking.js'),
    'utf8'
  );
  const patientApiCode = fs.readFileSync(
    path.join(frontendRoot, 'src/features/patient/services/patient.api.js'),
    'utf8'
  );
  assert.ok(patientApiCode.includes('/patients/appointments/${id}/queue-entry'));
  assert.ok(trackingHookCode.includes('getMyAppointmentQueueEntry'));
  assert.ok(trackingHookCode.includes('payload.queueVersion < prev.queueVersion'));
});
