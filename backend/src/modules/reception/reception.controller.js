/**
 * RECEPTION CONTROLLER - QUEUE MANAGEMENT
 * ========================================
 * Handles reception panel operations:
 * - Mark patient as arrived
 * - Move patient to doctor queue
 * - View queue status
 * - Update patient status
 */

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../errors/ApiError');
const Queue = require('../queue/queue.model');
const Appointment = require('../appointments/appointments.model');
const AttendanceTimeoutService = require('../queue/attendance.timeout.service');
const QueueScheduler = require('../queue/queue.scheduler.service');
const receptionService = require('./reception.service');
const withTransaction = require('../../utils/withTransaction.util');
const { broadcastQueueRecalculation } = require('../../sockets/socketEmitter');
const {
  normalizeDateOnly,
  getHospitalNow,
} = require('../../utils/datetime.util');

const getUserHospitalId = (user) =>
  user?.hospital?._id ||
  user?.hospital ||
  user?.assignedHospital?._id ||
  user?.assignedHospital ||
  null;

/**
 * Get today's appointments for the receptionist's hospital
 * Frontend calls: GET /api/reception/appointments/today
 * Used to populate the receptionist dashboard
 */
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

/**
 * Search for booking by booking number
 * Frontend calls: GET /api/reception/appointments/search?bookingNumber=ABC123
 */
const searchByBookingNumber = asyncHandler(async (req, res) => {
  const { bookingNumber } = req.query;

  if (!bookingNumber) {
    throw new ApiError(400, 'Booking number is required.');
  }

  const appointment = await receptionService.searchByBookingNumber(bookingNumber);

  // SECURITY: Verify appointment belongs to receptionist's hospital
  const hospitalId = getUserHospitalId(req.user);
  const appointmentHospitalId = appointment.hospital?._id || appointment.hospital;
  if (!hospitalId || appointmentHospitalId.toString() !== hospitalId.toString()) {
    throw new ApiError(403, 'You do not have access to this appointment.');
  }

  res.status(200).json(
    new ApiResponse(200, { appointment }, 'Appointment found.')
  );
});

/**
 * Verify Patient
 * Called when reception confirms patient's identity
 */
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

/**
 * Collect Payment
 * Called when reception collects payment from patient
 */
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

/**
 * Mark Patient as Arrived (Check-in)
 * Called when patient arrives at reception
 */
const markPatientArrived = asyncHandler(async (req, res) => {
  const appointmentId = req.params.id;
  const receptionistId = req.user._id;

  console.log('[RECEPTION] Marking patient arrived:', {
    appointment: appointmentId,
    receptionist: receptionistId,
  });

  const appointment = await receptionService.markArrived(appointmentId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        appointmentId: appointment._id,
        status: appointment.status,
        arrivedAt: appointment.arrivedAt,
      },
      'Patient marked as arrived successfully.'
    )
  );
});

/**
 * Mark a patient as pending (not arrived)
 * Called when reception identifies patient has not arrived
 */
const markPatientPending = asyncHandler(async (req, res) => {
  const { id: appointmentId } = req.params;

  console.log('[RECEPTION] Marking patient pending:', appointmentId);

  const { appointment, queue } = await receptionService.markPending(appointmentId);

  // Broadcast queue update with recalculated delays
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
        message: 'Patient marked as pending',
      },
      'Patient marked as pending successfully.'
    )
  );
});

/**
 * Update appointment status (Cancel or Mark No-show)
 * Called when reception needs to change appointment status
 */
const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  const receptionistId = req.user._id;

  if (!['cancelled', 'no-show'].includes(status)) {
    throw new ApiError(400, 'Status must be "cancelled" or "no-show".');
  }

  const appointment = await receptionService.updateStatus(
    req.params.id,
    receptionistId,
    { status, reason }
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        appointmentId: appointment._id,
        status: appointment.status,
        reason: reason || null,
      },
      `Appointment marked as ${status} successfully.`
    )
  );
});

/**
 * Move Patient to Doctor Queue
 * Called when reception releases patient to doctor queue
 */
const movePatientToDoctorQueue = asyncHandler(async (req, res) => {
  const appointmentId = req.params.id;

  console.log('[RECEPTION] Moving patient to doctor queue:', appointmentId);

  const appointment = await receptionService.moveToDoctorQueue(appointmentId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        appointmentId: appointment._id,
        isInDoctorQueue: appointment.isInDoctorQueue,
      },
      'Patient moved to doctor queue successfully.'
    )
  );
});

/**
 * Get queue for a specific doctor and date
 * Shows reception the current queue status
 */
const getQueueForDoctor = asyncHandler(async (req, res) => {
  const { doctorId, date } = req.query;

  if (!doctorId || !date) {
    throw new ApiError(400, 'doctorId and date are required');
  }

  const normalizedDate = normalizeDateOnly(new Date(date));

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
      select: 'tokenNumber timeSlot status',
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

  const formattedEntries = queue.entries.map((entry) => ({
    entryId: entry._id,
    tokenNumber: entry.tokenNumber,
    queuePosition: entry.queuePosition,
    patientName: entry.patient?.fullName,
    patientPhone: entry.patient?.phone,
    status: entry.status,
    arrivalStatus: entry.arrivalStatus,
    scheduledStartTime: entry.scheduledStartTime,
    estimatedStartTime: entry.estimatedStartTime,
    estimatedEndTime: entry.estimatedEndTime,
    estimatedWaitingMinutes: entry.estimatedWaitingMinutes,
    attendanceWindowClosesAt: entry.attendanceWindowClosesAt,
    isOverdueForArrival:
      entry.arrivalStatus === 'not-arrived' &&
      getHospitalNow() >= entry.attendanceWindowClosesAt,
    timeRemainingForArrival: AttendanceTimeoutService.getTimeRemainingForArrival(entry),
    isInDoctorQueue: true,
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
        entries: formattedEntries,
      },
      'Queue retrieved successfully.'
    )
  );
});

/**
 * Get patients waiting for arrival (not yet arrived)
 * Useful for reception to focus on who to check in
 */
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
    .filter((e) => e.arrivalStatus === 'not-arrived')
    .sort((a, b) => a.tokenNumber - b.tokenNumber)
    .map((entry) => ({
      entryId: entry._id,
      tokenNumber: entry.tokenNumber,
      patientName: entry.patient?.fullName,
      patientPhone: entry.patient?.phone,
      scheduledTime: entry.scheduledStartTime,
      overdue: getHospitalNow() >= entry.attendanceWindowClosesAt,
      timeRemaining: AttendanceTimeoutService.getTimeRemainingForArrival(entry),
    }));

  res.status(200).json(
    new ApiResponse(200, { waiting, count: waiting.length }, 'Retrieved waiting patients.')
  );
});

/**
 * Get overdue patients (past their 5-minute attendance window)
 * Useful for reception to follow up
 */
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
    return res.status(200).json(
      new ApiResponse(200, { overdue: [] }, 'No overdue patients.')
    );
  }

  const overdue = queue.entries
    .filter(
      (e) =>
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

/**
 * Manually trigger attendance timeout check for testing/manual override
 */
const checkAttendanceTimeouts = asyncHandler(async (req, res) => {
  const { doctorId, date } = req.body;

  if (!doctorId || !date) {
    throw new ApiError(400, 'doctorId and date are required');
  }

  const normalizedDate = normalizeDateOnly(new Date(date));

  const result = await withTransaction(async (session) => {
    const timeoutsApplied = await AttendanceTimeoutService.checkAndApplyTimeouts(
      doctorId,
      normalizedDate,
      session
    );

    return timeoutsApplied;
  });

  res.status(200).json(
    new ApiResponse(
      200,
      { timeoutsApplied: result },
      `Applied ${result} attendance timeouts.`
    )
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
