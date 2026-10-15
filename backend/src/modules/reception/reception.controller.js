const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../errors/ApiError');
const Queue = require('../queue/queue.model');
const AttendanceTimeoutService = require('../queue/attendance.timeout.service');
const QueueScheduler = require('../queue/queue.scheduler.service');
const receptionService = require('./reception.service');
const withTransaction = require('../../utils/withTransaction.util');
const { broadcastQueueRecalculation } = require('../../sockets/socketEmitter');
const { normalizeDateOnly, getHospitalNow } = require('../../utils/datetime.util');

const getUserHospitalId = (user) =>
  user?.hospital?._id ||
  user?.hospital ||
  user?.assignedHospital?._id ||
  user?.assignedHospital ||
  null;

const getTodaysAppointments = asyncHandler(async (req, res) => {
  const hospitalId = getUserHospitalId(req.user);
  const { status, search } = req.query;

  if (!hospitalId) {
    throw new ApiError(400, 'Your account is not assigned to a hospital.');
  }

  const appointments = await receptionService.getTodaysAppointments(hospitalId, {
    status,
    search,
  });

  res.status(200).json(
    new ApiResponse(200, { appointments }, "Today's appointments retrieved successfully.")
  );
});

const searchByBookingNumber = asyncHandler(async (req, res) => {
  const { bookingNumber } = req.query;

  if (!bookingNumber) {
    throw new ApiError(400, 'Booking number is required.');
  }

  const appointment = await receptionService.searchByBookingNumber(bookingNumber);

  const hospitalId = getUserHospitalId(req.user);
  const appointmentHospitalId = appointment.hospital?._id || appointment.hospital;
  if (!hospitalId || appointmentHospitalId.toString() !== hospitalId.toString()) {
    throw new ApiError(403, 'You do not have access to this appointment.');
  }

  res.status(200).json(new ApiResponse(200, { appointment }, 'Appointment found.'));
});

const verifyPatient = asyncHandler(async (req, res) => {
  const { verificationNotes } = req.body;
  const receptionistId = req.user._id;

  const appointment = await receptionService.verifyPatient(
    req.params.id,
    receptionistId,
    verificationNotes
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        appointmentId: appointment._id,
        verifiedAt: appointment.verifiedAt,
        verificationNotes: appointment.verificationNotes,
      },
      'Patient verified successfully.'
    )
  );
});

const collectPayment = asyncHandler(async (req, res) => {
  const { method, amount } = req.body;
  const receptionistId = req.user._id;

  const { appointment, payment } = await receptionService.collectPayment(
    req.params.id,
    receptionistId,
    { method, amount }
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        appointmentId: appointment._id,
        paymentId: payment._id,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
      },
      'Payment collected successfully.'
    )
  );
});

const markPatientArrived = asyncHandler(async (req, res) => {
  const appointmentId = req.params.id;
  const appointment = await receptionService.markArrived(appointmentId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        appointmentId: appointment._id,
        status: appointment.status,
        arrivedAt: appointment.arrivedAt,
        appointment,
      },
      'Patient marked as arrived successfully.'
    )
  );
});

const markPatientPending = asyncHandler(async (req, res) => {
  const { id: appointmentId } = req.params;

  const { appointment, queue } = await receptionService.markPending(appointmentId);

  broadcastQueueRecalculation({
    doctorId: queue.doctor,
    date: queue.date,
    queue,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        appointmentId: appointment._id,
        tokenNumber: appointment.tokenNumber,
        appointment,
        queue,
        message: 'Patient marked as pending',
      },
      'Patient marked as pending successfully.'
    )
  );
});

const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  const receptionistId = req.user._id;

  if (!['cancelled', 'no-show'].includes(status)) {
    throw new ApiError(400, 'Status must be "cancelled" or "no-show".');
  }

  const appointment = await receptionService.updateStatus(req.params.id, receptionistId, {
    status,
    reason,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        appointmentId: appointment._id,
        status: appointment.status,
        reason: reason || null,
        appointment,
      },
      `Appointment marked as ${status} successfully.`
    )
  );
});

const movePatientToDoctorQueue = asyncHandler(async (req, res) => {
  const appointmentId = req.params.id;
  const appointment = await receptionService.moveToDoctorQueue(appointmentId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        appointmentId: appointment._id,
        isInDoctorQueue: appointment.isInDoctorQueue,
        appointment,
      },
      'Patient moved to doctor queue successfully.'
    )
  );
});

const getQueueForDoctor = asyncHandler(async (req, res) => {
  const doctorId = req.params.doctorId || req.query.doctorId;
  const date = req.query.date || getHospitalNow();

  if (!doctorId) {
    throw new ApiError(400, 'doctorId is required');
  }

  const normalizedDate = normalizeDateOnly(new Date(date));

  await QueueScheduler.recalculateQueue(doctorId, normalizedDate);

  const queue = await Queue.findOne({
    doctor: doctorId,
    date: normalizedDate,
  })
    .populate({
      path: 'entries.patient',
      select: 'fullName phone',
    })
    .populate({
      path: 'entries.appointment',
      select: 'tokenNumber bookingNumber timeSlot status isInDoctorQueue',
    });

  if (!queue) {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          queue: null,
          entries: [],
          message: 'No queue exists for this doctor on this date yet',
        },
        'Queue retrieved successfully.'
      )
    );
  }

  const now = getHospitalNow();
  const formattedEntries = queue.entries.map((entry) => ({
    entryId: entry._id,
    appointmentId: entry.appointment?._id || entry.appointment,
    tokenNumber: entry.tokenNumber,
    bookingNumber: entry.appointment?.bookingNumber,
    queuePosition: entry.queuePosition,
    patientName: entry.patient?.fullName,
    patientPhone: entry.patient?.phone,
    status: entry.status,
    appointmentStatus: entry.appointment?.status,
    arrivalStatus: entry.arrivalStatus,
    scheduledStartTime: entry.scheduledStartTime,
    scheduledEndTime: entry.scheduledEndTime,
    estimatedStartTime: entry.estimatedStartTime,
    estimatedEndTime: entry.estimatedEndTime,
    estimatedConsultationStartTime: entry.estimatedConsultationStartTime,
    estimatedConsultationEndTime: entry.estimatedConsultationEndTime,
    recommendedArrivalTime: entry.recommendedArrivalTime,
    estimatedWaitingMinutes: entry.estimatedWaitingMinutes,
    timingStatus: entry.timingStatus,
    delayMinutes: entry.delayMinutes,
    aheadMinutes: entry.aheadMinutes,
    statusLabel: entry.statusLabel,
    statusMessage: entry.statusMessage,
    recommendedAction: entry.recommendedAction,
    attendanceWindowClosesAt: entry.attendanceWindowClosesAt,
    isOverdueForArrival:
      entry.arrivalStatus === 'not-arrived' &&
      Boolean(entry.attendanceWindowClosesAt) &&
      now >= entry.attendanceWindowClosesAt,
    timeRemainingForArrival: AttendanceTimeoutService.getTimeRemainingForArrival(entry),
    isInDoctorQueue: Boolean(entry.appointment?.isInDoctorQueue),
  }));

  res.status(200).json(
    new ApiResponse(
      200,
      {
        queueId: queue._id,
        doctor: queue.doctor,
        date: queue.date,
        totalTokensIssued: queue.totalTokensIssued,
        currentTokenNumber: queue.currentTokenNumber,
        averageConsultationMinutes: queue.averageConsultationMinutes,
        queueVersion: queue.queueVersion,
        timingSummary: queue.timingSummary,
        entries: formattedEntries,
      },
      'Queue retrieved successfully.'
    )
  );
});

const getWaitingForArrival = asyncHandler(async (req, res) => {
  const { doctorId } = req.query;

  if (!doctorId) {
    throw new ApiError(400, 'doctorId is required');
  }

  const today = normalizeDateOnly(getHospitalNow());

  const queue = await Queue.findOne({
    doctor: doctorId,
    date: today,
  }).populate({
    path: 'entries.patient',
    select: 'fullName phone',
  });

  if (!queue) {
    return res.status(200).json(
      new ApiResponse(200, { waiting: [] }, 'No patients waiting for arrival.')
    );
  }

  const waiting = queue.entries
    .filter((e) => e.arrivalStatus === 'not-arrived' && e.status === 'waiting')
    .sort((a, b) => a.tokenNumber - b.tokenNumber)
    .map((entry) => ({
      entryId: entry._id,
      tokenNumber: entry.tokenNumber,
      patientName: entry.patient?.fullName,
      patientPhone: entry.patient?.phone,
      scheduledTime: entry.scheduledStartTime,
      estimatedStartTime: entry.estimatedStartTime,
      timingStatus: entry.timingStatus,
      overdue:
        Boolean(entry.attendanceWindowClosesAt) &&
        getHospitalNow() >= entry.attendanceWindowClosesAt,
      timeRemaining: AttendanceTimeoutService.getTimeRemainingForArrival(entry),
    }));

  res.status(200).json(
    new ApiResponse(200, { waiting, count: waiting.length }, 'Retrieved waiting patients.')
  );
});

const getOverduePatients = asyncHandler(async (req, res) => {
  const { doctorId } = req.query;

  if (!doctorId) {
    throw new ApiError(400, 'doctorId is required');
  }

  const today = normalizeDateOnly(getHospitalNow());
  const now = getHospitalNow();

  const queue = await Queue.findOne({
    doctor: doctorId,
    date: today,
  }).populate({
    path: 'entries.patient',
    select: 'fullName phone',
  });

  if (!queue) {
    return res.status(200).json(new ApiResponse(200, { overdue: [] }, 'No overdue patients.'));
  }

  const overdue = queue.entries
    .filter(
      (e) =>
        e.status === 'waiting' &&
        e.arrivalStatus === 'not-arrived' &&
        e.attendanceWindowClosesAt &&
        now >= e.attendanceWindowClosesAt
    )
    .sort((a, b) => a.attendanceWindowClosesAt - b.attendanceWindowClosesAt)
    .map((entry) => ({
      entryId: entry._id,
      tokenNumber: entry.tokenNumber,
      patientName: entry.patient?.fullName,
      patientPhone: entry.patient?.phone,
      scheduledTime: entry.scheduledStartTime,
      windowClosedAt: entry.attendanceWindowClosesAt,
      minutesOverdue: Math.floor((now - entry.attendanceWindowClosesAt) / 60000),
    }));

  res.status(200).json(
    new ApiResponse(200, { overdue, count: overdue.length }, 'Retrieved overdue patients.')
  );
});

const checkAttendanceTimeouts = asyncHandler(async (req, res) => {
  const { doctorId, date } = req.body;

  if (!doctorId || !date) {
    throw new ApiError(400, 'doctorId and date are required');
  }

  const normalizedDate = normalizeDateOnly(new Date(date));

  const result = await withTransaction(async (session) => {
    return AttendanceTimeoutService.checkAndApplyTimeouts(doctorId, normalizedDate, session);
  });

  res.status(200).json(
    new ApiResponse(200, { timeoutsApplied: result }, `Applied ${result} attendance timeouts.`)
  );
});

module.exports = {
  getTodaysAppointments,
  searchByBookingNumber,
  verifyPatient,
  collectPayment,
  markPatientArrived,
  markPatientPending,
  updateAppointmentStatus,
  movePatientToDoctorQueue,
  getQueueForDoctor,
  getWaitingForArrival,
  getOverduePatients,
  checkAttendanceTimeouts,
};
