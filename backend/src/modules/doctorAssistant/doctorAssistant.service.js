const Doctor = require('../doctors/doctors.model');
const Appointment = require('../appointments/appointments.model');
const Queue = require('../queue/queue.model');
const QueueService = require('../queue/queue.service');
const QueueScheduler = require('../queue/queue.scheduler.service');
const ApiError = require('../../errors/ApiError');
const withTransaction = require('../../utils/withTransaction.util');
const { normalizeDateOnly, getHospitalNow } = require('../../utils/datetime.util');
const {
  notifyPatientCalled,
  broadcastQueueUpdate,
  broadcastQueueRecalculation,
  emitToHospital,
} = require('../../sockets/socketEmitter');
const { APPOINTMENT_STATUS, QUEUE_ENTRY_STATUS } = require('../../constants/enums');

const resolveDoctorAndDate = async (
  doctorId,
  dateInput,
  requesterHospitalId,
  requesterAssignedDoctorId
) => {
  const doctor = await Doctor.findOne({ _id: doctorId, isActive: true });
  if (!doctor) {
    throw new ApiError(404, 'Doctor not found or inactive.');
  }
  if (!requesterHospitalId || doctor.hospital.toString() !== requesterHospitalId.toString()) {
    throw new ApiError(403, "You are not authorized to manage this doctor's queue.");
  }
  if (
    requesterAssignedDoctorId &&
    doctor._id.toString() !== requesterAssignedDoctorId.toString()
  ) {
    throw new ApiError(403, "You are only authorized to manage your assigned doctor's queue.");
  }

  const normalizedDate = normalizeDateOnly(dateInput || getHospitalNow());
  return { doctor, normalizedDate };
};

const loadAppointmentAndQueue = async (
  appointmentId,
  requesterHospitalId,
  requesterAssignedDoctorId
) => {
  const appointment = await Appointment.findById(appointmentId).populate('doctor', 'hospital');
  if (!appointment) {
    throw new ApiError(404, 'Appointment not found.');
  }
  if (
    !requesterHospitalId ||
    appointment.doctor.hospital.toString() !== requesterHospitalId.toString()
  ) {
    throw new ApiError(403, 'This appointment does not belong to your hospital.');
  }
  if (
    requesterAssignedDoctorId &&
    appointment.doctor._id.toString() !== requesterAssignedDoctorId.toString()
  ) {
    throw new ApiError(403, "You are only authorized to manage your assigned doctor's queue.");
  }

  const queue = await Queue.findOne({
    doctor: appointment.doctor._id,
    date: appointment.appointmentDate,
  });
  if (!queue) {
    throw new ApiError(404, 'Queue not found for this appointment.');
  }

  return { appointment, queue };
};

// ---------------------------------------------------------------------
// 1. View Queue
// ---------------------------------------------------------------------
const getQueue = async (doctorId, dateInput, requesterHospitalId, requesterAssignedDoctorId) => {
  const { doctor, normalizedDate } = await resolveDoctorAndDate(
    doctorId,
    dateInput,
    requesterHospitalId,
    requesterAssignedDoctorId
  );

  // Recalculate so estimates and delay/ahead status reflect current server clock
  await QueueScheduler.recalculateQueue(doctor._id, normalizedDate);

  const queue = await Queue.findOne({ doctor: doctor._id, date: normalizedDate })
    .populate('entries.patient', 'fullName phone')
    .populate(
      'entries.appointment',
      'bookingNumber tokenNumber status isInDoctorQueue reasonForVisit symptoms timeSlot'
    );

  if (!queue) {
    return {
      queueStatus: 'active',
      currentTokenNumber: 0,
      totalTokensIssued: 0,
      averageConsultationMinutes: null,
      queueVersion: 1,
      timingSummary: null,
      currentPatient: null,
      waitingList: [],
      allWaitingEntries: [],
      totalCompleted: 0,
    };
  }

  const releasedEntries = queue.entries.filter((e) => e.appointment?.isInDoctorQueue);

  const currentPatient =
    queue.entries.find((e) =>
      [QUEUE_ENTRY_STATUS.CALLED, QUEUE_ENTRY_STATUS.IN_CONSULTATION].includes(e.status)
    ) || null;

  const waitingList = releasedEntries
    .filter((e) => e.status === QUEUE_ENTRY_STATUS.WAITING)
    .sort((a, b) => (a.queuePosition || a.tokenNumber) - (b.queuePosition || b.tokenNumber));

  const allWaitingEntries = queue.entries
    .filter((e) => e.status === QUEUE_ENTRY_STATUS.WAITING)
    .sort((a, b) => (a.queuePosition || a.tokenNumber) - (b.queuePosition || b.tokenNumber));

  const totalCompleted = queue.entries.filter(
    (e) => e.status === QUEUE_ENTRY_STATUS.COMPLETED
  ).length;

  return {
    queueStatus: queue.status,
    currentTokenNumber: queue.currentTokenNumber,
    totalTokensIssued: queue.totalTokensIssued,
    averageConsultationMinutes: queue.averageConsultationMinutes,
    queueVersion: queue.queueVersion,
    timingSummary: queue.timingSummary,
    currentPatient,
    waitingList,
    allWaitingEntries,
    totalCompleted,
  };
};

// ---------------------------------------------------------------------
// 2. Call Next Patient
// ---------------------------------------------------------------------
const callNextPatient = async (
  doctorId,
  dateInput,
  requesterHospitalId,
  requesterAssignedDoctorId
) => {
  const { doctor, normalizedDate } = await resolveDoctorAndDate(
    doctorId,
    dateInput,
    requesterHospitalId,
    requesterAssignedDoctorId
  );

  const result = await withTransaction(async (session) => {
    const queue = await Queue.findOne({ doctor: doctor._id, date: normalizedDate }).session(
      session
    );
    if (!queue) {
      throw new ApiError(404, 'No queue exists yet for this doctor on this date.');
    }

    const calledEntry = await QueueService.callNext(queue, session);
    await queue.save({ session });

    const recalculatedQueue = await QueueScheduler.recalculateQueue(
      doctor._id,
      normalizedDate,
      session
    );

    return { calledEntry, recalculatedQueue };
  });

  notifyPatientCalled({
    patientId: result.calledEntry.patient,
    appointmentId: result.calledEntry.appointment,
    tokenNumber: result.calledEntry.tokenNumber,
  });
  broadcastQueueRecalculation({
    doctorId: doctor._id,
    date: normalizedDate,
    queue: result.recalculatedQueue,
  });

  return { calledEntry: result.calledEntry, queue: result.recalculatedQueue };
};

// ---------------------------------------------------------------------
// 3. Start Consultation
// ---------------------------------------------------------------------
const startConsultation = async (
  appointmentId,
  requesterHospitalId,
  requesterAssignedDoctorId
) => {
  const { appointment, queue } = await loadAppointmentAndQueue(
    appointmentId,
    requesterHospitalId,
    requesterAssignedDoctorId
  );
  const entry = QueueService.findEntry(queue, appointmentId);

  const validStatuses = [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.CHECKED_IN];
  if (!validStatuses.includes(appointment.status)) {
    throw new ApiError(
      400,
      `Cannot start consultation — appointment status is "${appointment.status}".`
    );
  }

  const now = getHospitalNow();
  QueueService.startConsultation(entry, now);
  queue.currentTokenNumber = entry.tokenNumber;

  const result = await withTransaction(async (session) => {
    await queue.save({ session });
    appointment.status = APPOINTMENT_STATUS.IN_CONSULTATION;
    appointment.actualConsultationStartedAt = now;
    await appointment.save({ session });

    const recalculatedQueue = await QueueScheduler.recalculateQueue(
      appointment.doctor._id || appointment.doctor,
      appointment.appointmentDate,
      session
    );

    const updatedEntry = recalculatedQueue.entries.find(
      (e) => e.appointment.toString() === appointment._id.toString()
    );

    return { appointment, entry: updatedEntry || entry, recalculatedQueue };
  });

  broadcastQueueRecalculation({
    doctorId: appointment.doctor._id || appointment.doctor,
    date: appointment.appointmentDate,
    queue: result.recalculatedQueue,
  });

  return { appointment: result.appointment, entry: result.entry, queue: result.recalculatedQueue };
};

// ---------------------------------------------------------------------
// 4. Complete Consultation
// ---------------------------------------------------------------------
const completeConsultation = async (
  appointmentId,
  requesterHospitalId,
  requesterAssignedDoctorId
) => {
  const { appointment, queue } = await loadAppointmentAndQueue(
    appointmentId,
    requesterHospitalId,
    requesterAssignedDoctorId
  );
  const entry = QueueService.findEntry(queue, appointmentId);
  const doctorId = appointment.doctor._id || appointment.doctor;

  const now = getHospitalNow();
  const { actualMinutes } = QueueService.completeConsultation(queue, entry, now);

  const result = await withTransaction(async (session) => {
    await queue.save({ session });

    appointment.status = APPOINTMENT_STATUS.COMPLETED;
    appointment.actualConsultationCompletedAt = now;
    appointment.actualConsultationDurationMinutes = actualMinutes;
    appointment.isInDoctorQueue = false;
    await appointment.save({ session });

    const recalculatedQueue = await QueueScheduler.recalculateQueue(
      doctorId,
      appointment.appointmentDate,
      session
    );

    const updatedEntry = recalculatedQueue.entries.find(
      (e) => e.appointment.toString() === appointment._id.toString()
    );

    return {
      appointment,
      entry: updatedEntry || entry,
      actualMinutes,
      recalculatedQueue,
    };
  });

  broadcastQueueRecalculation({
    doctorId,
    date: appointment.appointmentDate,
    queue: result.recalculatedQueue,
  });

  return {
    appointment: result.appointment,
    entry: result.entry,
    actualMinutes: result.actualMinutes,
    averageConsultationMinutes: result.recalculatedQueue?.averageConsultationMinutes,
    queue: result.recalculatedQueue,
  };
};

// ---------------------------------------------------------------------
// 5. Skip Patient
// ---------------------------------------------------------------------
const skipPatient = async (appointmentId, requesterHospitalId, requesterAssignedDoctorId) => {
  const { appointment, queue } = await loadAppointmentAndQueue(
    appointmentId,
    requesterHospitalId,
    requesterAssignedDoctorId
  );
  const entry = QueueService.findEntry(queue, appointmentId);
  const doctorId = appointment.doctor._id || appointment.doctor;

  const result = await withTransaction(async (session) => {
    QueueService.skipPatient(entry);
    await queue.save({ session });

    appointment.isInDoctorQueue = false;
    await appointment.save({ session });

    const recalculatedQueue = await QueueScheduler.recalculateQueue(
      doctorId,
      appointment.appointmentDate,
      session
    );

    const updatedEntry = recalculatedQueue.entries.find(
      (e) => e.appointment.toString() === appointment._id.toString()
    );

    return { entry: updatedEntry || entry, recalculatedQueue };
  });

  broadcastQueueRecalculation({
    doctorId,
    date: appointment.appointmentDate,
    queue: result.recalculatedQueue,
  });

  return { entry: result.entry, queue: result.recalculatedQueue };
};

// ---------------------------------------------------------------------
// 6. Pause Queue
// ---------------------------------------------------------------------
const pauseQueue = async (
  doctorId,
  dateInput,
  requesterHospitalId,
  requesterAssignedDoctorId
) => {
  const { doctor, normalizedDate } = await resolveDoctorAndDate(
    doctorId,
    dateInput,
    requesterHospitalId,
    requesterAssignedDoctorId
  );

  const queue = await Queue.findOne({ doctor: doctor._id, date: normalizedDate });
  if (!queue) {
    throw new ApiError(404, 'No queue exists yet for this doctor on this date.');
  }

  QueueService.pause(queue);
  await queue.save();

  broadcastQueueUpdate({ doctorId: doctor._id, date: normalizedDate, queue });

  return queue;
};

// ---------------------------------------------------------------------
// 7. Resume Queue
// ---------------------------------------------------------------------
const resumeQueue = async (
  doctorId,
  dateInput,
  requesterHospitalId,
  requesterAssignedDoctorId
) => {
  const { doctor, normalizedDate } = await resolveDoctorAndDate(
    doctorId,
    dateInput,
    requesterHospitalId,
    requesterAssignedDoctorId
  );

  const queue = await Queue.findOne({ doctor: doctor._id, date: normalizedDate });
  if (!queue) {
    throw new ApiError(404, 'No queue exists yet for this doctor on this date.');
  }

  QueueService.resume(queue);
  await queue.save();

  const recalculatedQueue = await QueueScheduler.recalculateQueue(doctor._id, normalizedDate);
  broadcastQueueRecalculation({
    doctorId: doctor._id,
    date: normalizedDate,
    queue: recalculatedQueue || queue,
  });

  return recalculatedQueue || queue;
};

// ---------------------------------------------------------------------
// Configure average consultation time
// ---------------------------------------------------------------------
const setAverageConsultationMinutes = async (
  doctorId,
  dateInput,
  requesterHospitalId,
  minutes,
  requesterAssignedDoctorId
) => {
  const { doctor, normalizedDate } = await resolveDoctorAndDate(
    doctorId,
    dateInput,
    requesterHospitalId,
    requesterAssignedDoctorId
  );

  const recalculatedQueue = await QueueService.setAverageConsultationMinutes(
    doctor._id,
    normalizedDate,
    minutes
  );

  broadcastQueueRecalculation({
    doctorId: doctor._id,
    date: normalizedDate,
    queue: recalculatedQueue,
  });

  return recalculatedQueue;
};

// ---------------------------------------------------------------------
// Cascade cancel helper when doctor is marked unavailable
// ---------------------------------------------------------------------
const cascadeDoctorUnavailability = async (doctor, startDate, endDate, reason) => {
  const normStart = normalizeDateOnly(startDate);
  const normEnd = normalizeDateOnly(endDate);
  const now = getHospitalNow();

  const appointmentsToCancel = await Appointment.find({
    doctor: doctor._id,
    appointmentDate: { $gte: normStart, $lte: normEnd },
    status: {
      $in: [
        APPOINTMENT_STATUS.PENDING,
        APPOINTMENT_STATUS.CONFIRMED,
        APPOINTMENT_STATUS.CHECKED_IN,
      ],
    },
    isActive: true,
  });

  const affectedDates = new Set();

  for (const apt of appointmentsToCancel) {
    apt.status = APPOINTMENT_STATUS.CANCELLED;
    apt.cancellationReason = 'DOCTOR_UNAVAILABLE';
    apt.cancelledAt = now;
    apt.isInDoctorQueue = false;
    apt.queuePosition = null;
    apt.estimatedConsultationStartTime = null;
    apt.estimatedConsultationEndTime = null;
    apt.recommendedArrivalTime = null;
    apt.timingStatus = 'doctor-unavailable';
    apt.statusLabel = 'Doctor Unavailable';
    await apt.save();

    await Queue.updateOne(
      { doctor: doctor._id, date: apt.appointmentDate },
      {
        $set: {
          'entries.$[elem].status': QUEUE_ENTRY_STATUS.SKIPPED,
          'entries.$[elem].delayReason': 'doctor-unavailable',
          'entries.$[elem].queuePosition': null,
          'entries.$[elem].estimatedConsultationStartTime': null,
          'entries.$[elem].estimatedConsultationEndTime': null,
        },
      },
      { arrayFilters: [{ 'elem.appointment': apt._id }] }
    );

    affectedDates.add(apt.appointmentDate.toISOString());
  }

  for (const isoDate of affectedDates) {
    const d = new Date(isoDate);
    const recalculated = await QueueScheduler.recalculateQueue(doctor._id, d);
    if (recalculated) {
      broadcastQueueRecalculation({
        doctorId: doctor._id,
        date: d,
        queue: recalculated,
      });
    }
  }

  emitToHospital(doctor.hospital, 'doctor:unavailability-created', {
    doctorId: doctor._id,
    startDate: normStart,
    endDate: normEnd,
    reason,
    cancelledCount: appointmentsToCancel.length,
  });

  return appointmentsToCancel.length;
};

// ---------------------------------------------------------------------
// 8. Doctor Assistant Unavailability Management
// ---------------------------------------------------------------------
const createUnavailability = async (
  doctorId,
  startDate,
  endDate,
  reason,
  notes,
  createdBy,
  requesterHospitalId
) => {
  if (!doctorId) {
    throw new ApiError(400, 'Doctor ID is required.');
  }

  const doctor = await Doctor.findOne({ _id: doctorId, isActive: true });
  if (!doctor) {
    throw new ApiError(404, 'Doctor not found or inactive.');
  }

  if (doctor.hospital.toString() !== requesterHospitalId.toString()) {
    throw new ApiError(403, 'You can only manage doctors in your hospital.');
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    throw new ApiError(400, 'Start date must be before or equal to end date.');
  }

  if (normalizeDateOnly(start) < normalizeDateOnly(getHospitalNow())) {
    throw new ApiError(400, 'Cannot create unavailability for past dates.');
  }

  const unavailability = {
    startDate: start,
    endDate: end,
    reason,
    notes: notes || null,
    createdBy,
    createdAt: getHospitalNow(),
  };

  doctor.unavailability.push(unavailability);
  await doctor.save();

  await cascadeDoctorUnavailability(doctor, start, end, reason);

  return doctor.unavailability[doctor.unavailability.length - 1];
};

const getUnavailability = async (doctorId, requesterHospitalId) => {
  if (!doctorId) {
    throw new ApiError(400, 'Doctor ID is required.');
  }

  const doctor = await Doctor.findOne({ _id: doctorId, isActive: true }).select(
    'unavailability hospital'
  );

  if (!doctor) {
    throw new ApiError(404, 'Doctor not found or inactive.');
  }

  if (doctor.hospital.toString() !== requesterHospitalId.toString()) {
    throw new ApiError(403, 'You can only view doctors in your hospital.');
  }

  const today = normalizeDateOnly(getHospitalNow());
  return doctor.unavailability.filter((u) => normalizeDateOnly(u.endDate) >= today);
};

const updateUnavailability = async (
  unavailabilityId,
  doctorId,
  updates,
  requesterHospitalId
) => {
  if (!doctorId) {
    throw new ApiError(400, 'Doctor ID is required.');
  }

  const doctor = await Doctor.findOne({ _id: doctorId, isActive: true });
  if (!doctor) {
    throw new ApiError(404, 'Doctor not found or inactive.');
  }

  if (doctor.hospital.toString() !== requesterHospitalId.toString()) {
    throw new ApiError(403, 'You can only manage doctors in your hospital.');
  }

  const unavailability = doctor.unavailability.id(unavailabilityId);
  if (!unavailability) {
    throw new ApiError(404, 'Unavailability period not found.');
  }

  if (updates.startDate) unavailability.startDate = new Date(updates.startDate);
  if (updates.endDate) unavailability.endDate = new Date(updates.endDate);
  if (updates.reason) unavailability.reason = updates.reason;
  if (updates.notes !== undefined) unavailability.notes = updates.notes;

  if (unavailability.startDate > unavailability.endDate) {
    throw new ApiError(400, 'Start date must be before or equal to end date.');
  }

  await doctor.save();
  await cascadeDoctorUnavailability(
    doctor,
    unavailability.startDate,
    unavailability.endDate,
    unavailability.reason
  );

  return unavailability;
};

const deleteUnavailability = async (unavailabilityId, doctorId, requesterHospitalId) => {
  if (!doctorId) {
    throw new ApiError(400, 'Doctor ID is required.');
  }

  const doctor = await Doctor.findOne({ _id: doctorId, isActive: true });
  if (!doctor) {
    throw new ApiError(404, 'Doctor not found or inactive.');
  }

  if (doctor.hospital.toString() !== requesterHospitalId.toString()) {
    throw new ApiError(403, 'You can only manage doctors in your hospital.');
  }

  const unavailability = doctor.unavailability.id(unavailabilityId);
  if (!unavailability) {
    throw new ApiError(404, 'Unavailability period not found.');
  }

  doctor.unavailability.pull(unavailabilityId);
  await doctor.save();

  return { message: 'Unavailability period deleted successfully.' };
};

module.exports = {
  getQueue,
  callNextPatient,
  startConsultation,
  completeConsultation,
  skipPatient,
  pauseQueue,
  resumeQueue,
  setAverageConsultationMinutes,
  createUnavailability,
  getUnavailability,
  updateUnavailability,
  deleteUnavailability,
  cascadeDoctorUnavailability,
};
