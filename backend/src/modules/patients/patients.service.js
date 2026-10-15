const Hospital = require('../hospitals/hospitals.model');
const Department = require('../departments/departments.model');
const Doctor = require('../doctors/doctors.model');
const Appointment = require('../appointments/appointments.model');
const Queue = require('../queue/queue.model');
const QueueService = require('../queue/queue.service');
const QueueScheduler = require('../queue/queue.scheduler.service');
const ApiError = require('../../errors/ApiError');
const ApiFeatures = require('../../utils/apiFeatures.util');
const withTransaction = require('../../utils/withTransaction.util');
const {
  normalizeDateOnly,
  getWeekdayName,
  getHospitalNow,
  combineDateAndTime,
} = require('../../utils/datetime.util');
const {
  APPOINTMENT_STATUS,
  CONSULTATION_TYPE,
  QUEUE_ENTRY_STATUS,
  BOOKING_CONSTRAINTS,
} = require('../../constants/enums');
const { broadcastQueueRecalculation } = require('../../sockets/socketEmitter');

const APPOINTMENT_POPULATE = [
  {
    path: 'doctor',
    select: 'specialization consultationFee user',
    populate: { path: 'user', select: 'fullName' },
  },
  {
    path: 'hospital',
    select: 'name address contact',
  },
  { path: 'department', select: 'name' },
];

const loadAndValidateChain = async (hospitalId, departmentId, doctorId) => {
  const [hospital, department, doctor] = await Promise.all([
    Hospital.findOne({ _id: hospitalId, isActive: true }),
    Department.findOne({ _id: departmentId, isActive: true }),
    Doctor.findOne({ _id: doctorId, isActive: true }).populate('user', 'fullName'),
  ]);

  if (!hospital) throw new ApiError(404, 'Hospital not found or is currently inactive.');
  if (!department) throw new ApiError(404, 'Department not found or is currently inactive.');
  if (!doctor) throw new ApiError(404, 'Doctor not found or is currently inactive.');

  if (department.hospital.toString() !== hospitalId.toString()) {
    throw new ApiError(400, 'Selected department does not belong to the selected hospital.');
  }
  if (
    doctor.hospital.toString() !== hospitalId.toString() ||
    doctor.department.toString() !== departmentId.toString()
  ) {
    throw new ApiError(400, 'Selected doctor does not belong to the selected hospital/department.');
  }

  return { hospital, department, doctor };
};

const checkDoctorUnavailability = (doctor, appointmentDate) => {
  const normalizedDate = normalizeDateOnly(appointmentDate);

  for (const unavail of doctor.unavailability || []) {
    const startDate = normalizeDateOnly(unavail.startDate);
    const endDate = normalizeDateOnly(unavail.endDate);

    if (normalizedDate >= startDate && normalizedDate <= endDate) {
      return unavail;
    }
  }

  return null;
};

/**
 * Books a new appointment and delegates queue entry creation + authoritative
 * recalculation to QueueService / QueueScheduler.
 */
const bookAppointment = async (patientId, payload) => {
  const { hospital, department, doctor, appointmentDate, reasonForVisit, symptoms } = payload;

  const chain = await loadAndValidateChain(hospital, department, doctor);

  const normalizedDate = normalizeDateOnly(appointmentDate);
  const now = getHospitalNow();
  const today = normalizeDateOnly(now);

  if (normalizedDate < today) {
    throw new ApiError(400, 'Cannot book an appointment for a past date.');
  }

  const maxAdvanceDate = new Date(today);
  maxAdvanceDate.setUTCDate(maxAdvanceDate.getUTCDate() + BOOKING_CONSTRAINTS.MAX_ADVANCE_DAYS);
  if (normalizedDate > maxAdvanceDate) {
    throw new ApiError(
      400,
      `Appointments can only be booked up to ${BOOKING_CONSTRAINTS.MAX_ADVANCE_DAYS} days in advance.`
    );
  }

  const unavailPeriod = checkDoctorUnavailability(chain.doctor, normalizedDate);
  if (unavailPeriod) {
    throw new ApiError(
      400,
      `Dr. ${chain.doctor.user?.fullName ?? 'this doctor'} is unavailable on this date (${unavailPeriod.reason}). Please choose another date.`
    );
  }

  const weekday = getWeekdayName(normalizedDate);
  const daySchedule = chain.doctor.availability.find(
    (slot) => String(slot.day || '').toLowerCase() === weekday.toLowerCase()
  );
  if (!daySchedule) {
    throw new ApiError(
      400,
      `Dr. ${chain.doctor.user?.fullName ?? 'this doctor'} is not available on ${weekday}s.`
    );
  }

  const maxPatients = daySchedule.maxPatients || 30;
  if (!maxPatients || maxPatients < 1) {
    throw new ApiError(500, 'Doctor schedule is not properly configured. Please contact support.');
  }

  const isToday = normalizedDate.getTime() === today.getTime();
  if (isToday && !chain.doctor.isAvailableToday) {
    throw new ApiError(400, 'This doctor is unavailable today. Please choose another date.');
  }

  const result = await withTransaction(async (session) => {
    const activeAppointmentCount = await Appointment.countDocuments({
      doctor: chain.doctor._id,
      appointmentDate: normalizedDate,
      status: { $ne: APPOINTMENT_STATUS.CANCELLED },
      isActive: true,
    }).session(session);

    if (activeAppointmentCount >= maxPatients) {
      throw new ApiError(409, 'All slots for this doctor on the selected date are fully booked.');
    }

    const tokenNumber = await QueueService.getNextTokenNumber(
      chain.doctor._id,
      normalizedDate,
      session
    );

    const timeSlot = QueueService.computeScheduledSlot(daySchedule, tokenNumber, normalizedDate);
    const bookingNumber = QueueService.generateBookingNumber(
      chain.doctor._id,
      normalizedDate,
      tokenNumber
    );

    const appointmentStartTime = combineDateAndTime(normalizedDate, timeSlot.start);
    const appointmentEndTime = combineDateAndTime(normalizedDate, timeSlot.end);
    const cutoffTime = new Date(appointmentStartTime);
    cutoffTime.setUTCHours(
      cutoffTime.getUTCHours() + BOOKING_CONSTRAINTS.CONSULTATION_WINDOW_HOURS
    );

    const [createdAppointment] = await Appointment.create(
      [
        {
          patient: patientId,
          doctor: chain.doctor._id,
          hospital: chain.hospital._id,
          department: chain.department._id,
          appointmentDate: normalizedDate,
          timeSlot,
          tokenNumber,
          bookingNumber,
          status: APPOINTMENT_STATUS.CONFIRMED,
          consultationType: CONSULTATION_TYPE.ONLINE_BOOKING,
          reasonForVisit,
          symptoms,
          createdBy: patientId,
          cutoffTime,
          isActive: true,
          initialEstimatedStartTime: appointmentStartTime,
          initialEstimatedEndTime: appointmentEndTime,
          estimatedConsultationStartTime: appointmentStartTime,
          estimatedConsultationEndTime: appointmentEndTime,
          consultationDurationMinutes: daySchedule.slotDurationMinutes || 15,
        },
      ],
      { session }
    );
    const appointmentId = createdAppointment._id;

    // addEntry inserts the entry and runs QueueScheduler.recalculateQueue once
    const recalculatedQueue = await QueueService.addEntry(
      {
        hospitalId: chain.hospital._id,
        departmentId: chain.department._id,
        doctorId: chain.doctor._id,
        date: normalizedDate,
        appointmentId,
        patientId,
        tokenNumber,
        averageConsultationMinutes: daySchedule.slotDurationMinutes,
        timeSlot,
      },
      session
    );

    const appointment = await Appointment.findById(appointmentId)
      .populate(APPOINTMENT_POPULATE)
      .session(session);
    const myEntry = recalculatedQueue.entries.find(
      (e) => e.appointment.toString() === appointmentId.toString()
    );

    return {
      appointment,
      bookingNumber,
      queueNumber: tokenNumber,
      doctorId: chain.doctor._id,
      date: normalizedDate,
      recalculatedQueue,
      estimatedConsultationStartTime: myEntry?.estimatedConsultationStartTime,
      estimatedConsultationEndTime: myEntry?.estimatedConsultationEndTime,
      recommendedArrivalTime: myEntry?.recommendedArrivalTime,
      timingStatus: myEntry?.timingStatus || 'on-time',
      delayMinutes: myEntry?.delayMinutes || 0,
      aheadMinutes: myEntry?.aheadMinutes || 0,
      statusLabel: myEntry?.statusLabel || 'On Time',
      statusMessage: myEntry?.statusMessage || null,
      recommendedAction: myEntry?.recommendedAction || null,
      queueStatus: {
        currentlyServingToken: recalculatedQueue.currentTokenNumber,
        totalTokensIssued: recalculatedQueue.totalTokensIssued,
        queuePosition: myEntry?.queuePosition,
        estimatedWaitingMinutes: myEntry?.estimatedWaitingMinutes,
        timingStatus: myEntry?.timingStatus || 'on-time',
        delayMinutes: myEntry?.delayMinutes || 0,
        aheadMinutes: myEntry?.aheadMinutes || 0,
        statusLabel: myEntry?.statusLabel || 'On Time',
        queueVersion: recalculatedQueue.queueVersion || 1,
      },
    };
  });

  broadcastQueueRecalculation({
    doctorId: result.doctorId,
    date: result.date,
    queue: result.recalculatedQueue,
  });

  return {
    appointment: result.appointment,
    bookingNumber: result.bookingNumber,
    queueNumber: result.queueNumber,
    estimatedConsultationStartTime: result.estimatedConsultationStartTime,
    estimatedConsultationEndTime: result.estimatedConsultationEndTime,
    estimatedReportingTime: result.estimatedConsultationStartTime,
    recommendedArrivalTime: result.recommendedArrivalTime,
    timingStatus: result.timingStatus,
    delayMinutes: result.delayMinutes,
    aheadMinutes: result.aheadMinutes,
    statusLabel: result.statusLabel,
    statusMessage: result.statusMessage,
    recommendedAction: result.recommendedAction,
    queueStatus: result.queueStatus,
  };
};

const getMyAppointments = async (patientId, queryString) => {
  const query = { ...queryString, patient: patientId };

  const features = new ApiFeatures(Appointment.find().populate(APPOINTMENT_POPULATE), query)
    .filter(['patient', 'status', 'hospital', 'doctor'])
    .sort()
    .paginate();

  const [appointments, total] = await Promise.all([
    features.query,
    Appointment.countDocuments(features.filterQuery),
  ]);

  return { appointments, total, pagination: features.pagination };
};

const getMyAppointmentById = async (patientId, appointmentId) => {
  const appointment = await Appointment.findOne({
    _id: appointmentId,
    patient: patientId,
  }).populate(APPOINTMENT_POPULATE);

  if (!appointment) {
    throw new ApiError(404, 'Appointment not found.');
  }
  return appointment;
};

/**
 * Cancels the patient's own appointment, removes it from the active queue sequence,
 * recalculates all remaining waiting patients, and broadcasts the update via Socket.IO.
 */
const cancelMyAppointment = async (patientId, appointmentId, cancellationReason) => {
  const appointment = await Appointment.findOne({ _id: appointmentId, patient: patientId });

  if (!appointment) {
    throw new ApiError(404, 'Appointment not found.');
  }

  if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
    throw new ApiError(400, 'This appointment is already cancelled.');
  }

  if (appointment.status === APPOINTMENT_STATUS.COMPLETED) {
    throw new ApiError(400, 'Cannot cancel a completed appointment.');
  }

  const now = getHospitalNow();

  const { updatedAppointment, recalculatedQueue } = await withTransaction(async (session) => {
    appointment.status = APPOINTMENT_STATUS.CANCELLED;
    appointment.cancelledBy = patientId;
    appointment.cancellationReason = cancellationReason || null;
    appointment.cancelledAt = now;
    appointment.isInDoctorQueue = false;
    appointment.queuePosition = null;
    appointment.estimatedConsultationStartTime = null;
    appointment.estimatedConsultationEndTime = null;
    appointment.recommendedArrivalTime = null;
    appointment.timingStatus = 'cancelled';
    appointment.statusLabel = 'Cancelled';
    await appointment.save({ session });

    await Queue.updateOne(
      { doctor: appointment.doctor, date: appointment.appointmentDate },
      {
        $set: {
          'entries.$[elem].status': QUEUE_ENTRY_STATUS.SKIPPED,
          'entries.$[elem].delayReason': 'cancelled',
          'entries.$[elem].queuePosition': null,
          'entries.$[elem].estimatedConsultationStartTime': null,
          'entries.$[elem].estimatedConsultationEndTime': null,
        },
      },
      { arrayFilters: [{ 'elem.appointment': appointment._id }], session }
    );

    const recalculated = await QueueScheduler.recalculateQueue(
      appointment.doctor,
      appointment.appointmentDate,
      session
    );

    const populated = await Appointment.findById(appointment._id)
      .populate(APPOINTMENT_POPULATE)
      .session(session);

    return { updatedAppointment: populated || appointment, recalculatedQueue: recalculated };
  });

  // Broadcast AFTER transaction commits so Reception, Doctor Assistant, and all subsequent Patients update immediately
  if (recalculatedQueue) {
    broadcastQueueRecalculation({
      doctorId: appointment.doctor,
      date: appointment.appointmentDate,
      queue: recalculatedQueue,
    });
  }

  return updatedAppointment;
};

module.exports = {
  bookAppointment,
  getMyAppointments,
  getMyAppointmentById,
  cancelMyAppointment,
};
