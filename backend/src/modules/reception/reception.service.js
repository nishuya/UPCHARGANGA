const Appointment = require('../appointments/appointments.model');
const Queue = require('../queue/queue.model');
const QueueService = require('../queue/queue.service');
const QueueScheduler = require('../queue/queue.scheduler.service');
const Payment = require('../payments/payments.model');
const Doctor = require('../doctors/doctors.model');
const ApiError = require('../../errors/ApiError');
const withTransaction = require('../../utils/withTransaction.util');
const { normalizeDateOnly, getHospitalNow } = require('../../utils/datetime.util');
const { notifyPatientVerified, broadcastQueueRecalculation } = require('../../sockets/socketEmitter');
const {
  APPOINTMENT_STATUS,
  QUEUE_ENTRY_STATUS,
  PAYMENT_STATUS,
  PAYMENT_GATEWAY,
} = require('../../constants/enums');

const APPOINTMENT_POPULATE = [
  { path: 'patient', select: 'fullName email phone gender dateOfBirth profileImage' },
  {
    path: 'doctor',
    select: 'specialization consultationFee availability user',
    populate: { path: 'user', select: 'fullName' },
  },
  { path: 'hospital', select: 'name' },
  { path: 'department', select: 'name' },
  { path: 'payment' },
];

const TERMINAL_STATUSES = [
  APPOINTMENT_STATUS.COMPLETED,
  APPOINTMENT_STATUS.CANCELLED,
  APPOINTMENT_STATUS.NO_SHOW,
];

const findAppointmentOr404 = async (appointmentId) => {
  const appointment = await Appointment.findById(appointmentId).populate(APPOINTMENT_POPULATE);
  if (!appointment) {
    throw new ApiError(404, 'Appointment not found.');
  }
  return appointment;
};

const updateQueueEntry = async (appointment, fields, session) => {
  await Queue.updateOne(
    { doctor: appointment.doctor._id || appointment.doctor, date: appointment.appointmentDate },
    {
      $set: Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [`entries.$[elem].${key}`, value])
      ),
    },
    { arrayFilters: [{ 'elem.appointment': appointment._id }], session }
  );
};

// ---------------------------------------------------------------------
// 0. Today's Patients — the dashboard's main board
// ---------------------------------------------------------------------
const getTodaysAppointments = async (hospitalId, { status, search } = {}) => {
  if (!hospitalId) {
    throw new ApiError(400, 'Your account is not assigned to a hospital yet.');
  }

  const today = normalizeDateOnly(getHospitalNow());

  // Ensure all active queues for this hospital today are recalculated so
  // reception sees up-to-the-minute estimates and late/delayed indicators.
  const activeQueues = await Queue.find({ hospital: hospitalId, date: today }, 'doctor date').lean();
  for (const q of activeQueues) {
    await QueueScheduler.recalculateQueue(q.doctor, q.date);
  }

  const filter = {
    hospital: hospitalId,
    appointmentDate: today,
  };
  if (status) filter.status = status;
  if (search) filter.bookingNumber = new RegExp(search.trim(), 'i');

  const appointments = await Appointment.find(filter)
    .sort('tokenNumber')
    .populate(APPOINTMENT_POPULATE);

  return appointments;
};

// ---------------------------------------------------------------------
// 1. Search Booking Number
// ---------------------------------------------------------------------
const searchByBookingNumber = async (bookingNumber) => {
  const appointment = await Appointment.findOne({ bookingNumber }).populate(APPOINTMENT_POPULATE);
  if (!appointment) {
    throw new ApiError(404, 'No appointment found with this booking number.');
  }
  return appointment;
};

// ---------------------------------------------------------------------
// 2. Verify Patient
// ---------------------------------------------------------------------
const verifyPatient = async (appointmentId, receptionistId, verificationNotes) => {
  const appointment = await findAppointmentOr404(appointmentId);

  if (TERMINAL_STATUSES.includes(appointment.status)) {
    throw new ApiError(
      400,
      `Cannot verify a patient whose appointment is already ${appointment.status}.`
    );
  }

  appointment.verifiedAt = getHospitalNow();
  appointment.verifiedBy = receptionistId;
  appointment.verificationNotes = verificationNotes || null;
  await appointment.save();

  notifyPatientVerified({
    patientId: appointment.patient._id || appointment.patient,
    appointmentId: appointment._id,
    bookingNumber: appointment.bookingNumber,
  });

  return appointment;
};

// ---------------------------------------------------------------------
// 3. Collect Payment
// ---------------------------------------------------------------------
const collectPayment = async (appointmentId, receptionistId, { method, amount }) => {
  const appointment = await findAppointmentOr404(appointmentId);

  if (TERMINAL_STATUSES.includes(appointment.status)) {
    throw new ApiError(
      400,
      `Cannot collect payment for an appointment that is already ${appointment.status}.`
    );
  }

  const existingSuccessfulPayment = await Payment.findOne({
    appointment: appointment._id,
    status: PAYMENT_STATUS.SUCCESS,
  });
  if (existingSuccessfulPayment) {
    throw new ApiError(409, 'Payment has already been collected for this appointment.');
  }

  const doctor = await Doctor.findById(appointment.doctor._id || appointment.doctor);
  const finalAmount = amount !== undefined ? amount : doctor.consultationFee;

  const payment = await Payment.create({
    appointment: appointment._id,
    patient: appointment.patient._id || appointment.patient,
    amount: finalAmount,
    method,
    gateway: PAYMENT_GATEWAY.CASH_COUNTER,
    status: PAYMENT_STATUS.SUCCESS,
    paidAt: getHospitalNow(),
    receivedBy: receptionistId,
  });

  appointment.payment = payment._id;
  await appointment.save();

  return { appointment, payment };
};

// ---------------------------------------------------------------------
// 4. Mark Pending (Patient missed turn — removed from active sequence)
// ---------------------------------------------------------------------
const markPending = async (appointmentId) => {
  const appointment = await findAppointmentOr404(appointmentId);

  if (
    ![
      APPOINTMENT_STATUS.PENDING,
      APPOINTMENT_STATUS.CONFIRMED,
      APPOINTMENT_STATUS.CHECKED_IN,
    ].includes(appointment.status)
  ) {
    throw new ApiError(
      400,
      `Cannot mark pending — appointment status is already "${appointment.status}".`
    );
  }

  const now = getHospitalNow();

  return withTransaction(async (session) => {
    const queue = await Queue.findOne({
      doctor: appointment.doctor._id || appointment.doctor,
      date: appointment.appointmentDate,
    }).session(session);

    if (!queue) {
      throw new ApiError(404, 'Queue not found for this appointment.');
    }

    const entry = queue.entries.find(
      (e) => e.appointment.toString() === appointment._id.toString()
    );
    if (!entry) {
      throw new ApiError(404, 'Queue entry not found for this appointment.');
    }

    // Move patient out of active scheduled sequence
    QueueService.markPending(entry, now);
    await queue.save({ session });

    appointment.status = APPOINTMENT_STATUS.PENDING;
    appointment.isInDoctorQueue = false;
    await appointment.save({ session });

    // Recalculate queue — downstream patients immediately move up
    const recalculatedQueue = await QueueScheduler.recalculateQueue(
      queue.doctor,
      queue.date,
      session
    );

    const updatedAppointment = await Appointment.findById(appointment._id)
      .populate(APPOINTMENT_POPULATE)
      .session(session);

    return { appointment: updatedAppointment || appointment, queue: recalculatedQueue };
  });
};

// ---------------------------------------------------------------------
// 5. Mark Arrived (Check-in or Rejoin after Pending/Skipped)
// ---------------------------------------------------------------------
const markArrived = async (appointmentId) => {
  const appointment = await findAppointmentOr404(appointmentId);

  if (![APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED].includes(appointment.status)) {
    throw new ApiError(
      400,
      `Cannot mark arrived — appointment status is already "${appointment.status}".`
    );
  }

  const now = getHospitalNow();
  const doctorId = appointment.doctor._id || appointment.doctor;

  const result = await withTransaction(async (session) => {
    appointment.status = APPOINTMENT_STATUS.CHECKED_IN;
    appointment.arrivedAt = now;
    appointment.attendanceMarkedAt = now;
    await appointment.save({ session });

    const queue = await Queue.findOne({
      doctor: doctorId,
      date: appointment.appointmentDate,
    }).session(session);

    if (queue) {
      const entry = queue.entries.find(
        (e) => e.appointment.toString() === appointment._id.toString()
      );
      if (entry) {
        if ([QUEUE_ENTRY_STATUS.PENDING, QUEUE_ENTRY_STATUS.SKIPPED].includes(entry.status)) {
          QueueService.rejoinPatient(queue, entry, now);
        } else {
          const isLate =
            entry.attendanceWindowClosesAt && now > entry.attendanceWindowClosesAt;
          entry.checkedInAt = now;
          entry.arrivalStatus = isLate ? 'arrived-late' : 'arrived-on-time';
          entry.attendanceTimeoutApplied = true;
        }
        await queue.save({ session });
      }
    }

    const recalculatedQueue = await QueueScheduler.recalculateQueue(
      doctorId,
      appointment.appointmentDate,
      session
    );

    const updatedAppointment = await Appointment.findById(appointment._id)
      .populate(APPOINTMENT_POPULATE)
      .session(session);

    return { appointment: updatedAppointment || appointment, recalculatedQueue };
  });

  broadcastQueueRecalculation({
    doctorId,
    date: appointment.appointmentDate,
    queue: result.recalculatedQueue,
  });

  return result.appointment;
};

// ---------------------------------------------------------------------
// 6. Move Patient to Doctor Queue
// ---------------------------------------------------------------------
const moveToDoctorQueue = async (appointmentId) => {
  const appointment = await findAppointmentOr404(appointmentId);

  if (appointment.status !== APPOINTMENT_STATUS.CHECKED_IN) {
    throw new ApiError(400, 'Patient must be marked arrived before moving to the doctor queue.');
  }
  if (appointment.isInDoctorQueue) {
    throw new ApiError(400, 'Patient is already in the doctor queue.');
  }
  if (!appointment.payment) {
    throw new ApiError(
      400,
      'Please collect payment before moving the patient to the doctor queue.'
    );
  }

  const doctorId = appointment.doctor._id || appointment.doctor;

  const result = await withTransaction(async (session) => {
    appointment.isInDoctorQueue = true;
    await appointment.save({ session });

    await updateQueueEntry(appointment, { status: QUEUE_ENTRY_STATUS.WAITING }, session);

    const recalculatedQueue = await QueueScheduler.recalculateQueue(
      doctorId,
      appointment.appointmentDate,
      session
    );

    const updatedAppointment = await Appointment.findById(appointment._id)
      .populate(APPOINTMENT_POPULATE)
      .session(session);

    return { appointment: updatedAppointment || appointment, recalculatedQueue };
  });

  broadcastQueueRecalculation({
    doctorId,
    date: appointment.appointmentDate,
    queue: result.recalculatedQueue,
  });

  return result.appointment;
};

// ---------------------------------------------------------------------
// 7. Update appointment status (Cancel or Mark No-show)
// ---------------------------------------------------------------------
const updateStatus = async (appointmentId, receptionistId, { status, reason }) => {
  const appointment = await findAppointmentOr404(appointmentId);

  if (TERMINAL_STATUSES.includes(appointment.status)) {
    throw new ApiError(400, `Appointment is already ${appointment.status}.`);
  }

  const doctorId = appointment.doctor._id || appointment.doctor;
  const now = getHospitalNow();

  const result = await withTransaction(async (session) => {
    appointment.status = status;
    appointment.isInDoctorQueue = false;
    appointment.queuePosition = null;
    appointment.estimatedConsultationStartTime = null;
    appointment.estimatedConsultationEndTime = null;
    appointment.recommendedArrivalTime = null;

    if (status === APPOINTMENT_STATUS.CANCELLED) {
      appointment.cancelledBy = receptionistId;
      appointment.cancellationReason = reason || null;
      appointment.cancelledAt = now;
      appointment.timingStatus = 'cancelled';
      appointment.statusLabel = 'Cancelled';
    } else {
      appointment.timingStatus = 'no-show';
      appointment.statusLabel = 'No Show';
    }

    await appointment.save({ session });

    const queueEntryStatus =
      status === APPOINTMENT_STATUS.CANCELLED
        ? QUEUE_ENTRY_STATUS.SKIPPED
        : QUEUE_ENTRY_STATUS.NO_SHOW;

    await updateQueueEntry(
      appointment,
      {
        status: queueEntryStatus,
        delayReason: status === APPOINTMENT_STATUS.CANCELLED ? 'cancelled' : 'no-show',
        queuePosition: null,
        estimatedConsultationStartTime: null,
        estimatedConsultationEndTime: null,
      },
      session
    );

    const recalculatedQueue = await QueueScheduler.recalculateQueue(
      doctorId,
      appointment.appointmentDate,
      session
    );

    const updatedAppointment = await Appointment.findById(appointment._id)
      .populate(APPOINTMENT_POPULATE)
      .session(session);

    return { appointment: updatedAppointment || appointment, recalculatedQueue };
  });

  broadcastQueueRecalculation({
    doctorId,
    date: appointment.appointmentDate,
    queue: result.recalculatedQueue,
  });

  return result.appointment;
};

module.exports = {
  getTodaysAppointments,
  searchByBookingNumber,
  verifyPatient,
  collectPayment,
  markPending,
  markArrived,
  moveToDoctorQueue,
  updateStatus,
};
