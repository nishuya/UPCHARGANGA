const Appointment = require('./appointments.model');
const Queue = require('../queue/queue.model');
const QueueScheduler = require('../queue/queue.scheduler.service');
const ApiError = require('../../errors/ApiError');
const { normalizeDateOnly, getHospitalNow } = require('../../utils/datetime.util');
const { APPOINTMENT_STATUS } = require('../../constants/enums');

const getAppointmentById = async (appointmentId) => {
  const appointment = await Appointment.findById(appointmentId)
    .populate([
      { path: 'patient', select: 'fullName email phone' },
      { path: 'doctor', select: 'specialization user', populate: { path: 'user', select: 'fullName' } },
      { path: 'hospital', select: 'name' },
      { path: 'department', select: 'name' },
      { path: 'payment' },
    ]);

  if (!appointment) {
    throw new ApiError(404, 'Appointment not found');
  }

  return appointment;
};

const getPatientAppointments = async (patientId, { status, startDate, endDate } = {}) => {
  const query = { patient: patientId, isActive: true };

  if (status) {
    query.status = status;
  }

  if (startDate || endDate) {
    query.appointmentDate = {};
    if (startDate) query.appointmentDate.$gte = normalizeDateOnly(new Date(startDate));
    if (endDate) query.appointmentDate.$lte = normalizeDateOnly(new Date(endDate));
  }

  const appointments = await Appointment.find(query)
    .sort({ appointmentDate: -1 })
    .populate([
      { path: 'doctor', select: 'specialization user', populate: { path: 'user', select: 'fullName' } },
      { path: 'hospital', select: 'name' },
      { path: 'department', select: 'name' },
    ]);

  return appointments;
};

const getDoctorAppointmentsForDate = async (doctorId, appointmentDate, { status } = {}) => {
  const query = {
    doctor: doctorId,
    appointmentDate: normalizeDateOnly(new Date(appointmentDate)),
    isActive: true,
  };

  if (status) {
    query.status = status;
  }

  const appointments = await Appointment.find(query)
    .sort({ 'timeSlot.start': 1 })
    .populate([
      { path: 'patient', select: 'fullName email phone' },
      { path: 'hospital', select: 'name' },
      { path: 'department', select: 'name' },
    ]);

  return appointments;
};

const getHospitalAppointments = async (hospitalId, { status, date, doctorId } = {}) => {
  const query = { hospital: hospitalId, isActive: true };

  if (status) {
    query.status = status;
  }

  if (date) {
    query.appointmentDate = normalizeDateOnly(new Date(date));
  }

  if (doctorId) {
    query.doctor = doctorId;
  }

  const appointments = await Appointment.find(query)
    .sort({ appointmentDate: -1, 'timeSlot.start': 1 })
    .populate([
      { path: 'patient', select: 'fullName email phone' },
      { path: 'doctor', select: 'specialization user', populate: { path: 'user', select: 'fullName' } },
      { path: 'department', select: 'name' },
    ]);

  return appointments;
};

const updateAppointmentStatus = async (appointmentId, newStatus, reason = null) => {
  const appointment = await getAppointmentById(appointmentId);

  const terminalStatuses = [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.CANCELLED];
  if (terminalStatuses.includes(appointment.status)) {
    throw new ApiError(400, `Cannot update appointment with status ${appointment.status}`);
  }

  appointment.status = newStatus;

  if (reason && newStatus === APPOINTMENT_STATUS.CANCELLED) {
    appointment.cancellationReason = reason;
    appointment.cancelledAt = getHospitalNow();
  }

  await appointment.save();
  return appointment;
};

const getDoctorAppointmentStats = async (doctorId, { startDate, endDate } = {}) => {
  const query = { doctor: doctorId, isActive: true };

  if (startDate || endDate) {
    query.appointmentDate = {};
    if (startDate) query.appointmentDate.$gte = normalizeDateOnly(new Date(startDate));
    if (endDate) query.appointmentDate.$lte = normalizeDateOnly(new Date(endDate));
  }

  const appointments = await Appointment.find(query);

  const stats = {
    total: appointments.length,
    completed: appointments.filter((a) => a.status === APPOINTMENT_STATUS.COMPLETED).length,
    pending: appointments.filter((a) => a.status === APPOINTMENT_STATUS.PENDING).length,
    confirmed: appointments.filter((a) => a.status === APPOINTMENT_STATUS.CONFIRMED).length,
    cancelled: appointments.filter((a) => a.status === APPOINTMENT_STATUS.CANCELLED).length,
    noShow: appointments.filter((a) => a.status === APPOINTMENT_STATUS.NO_SHOW).length,
  };

  return stats;
};

/**
 * Get the authoritative queue entry for an appointment (with live recalculation if on service day).
 */
const getQueueEntryForAppointment = async (appointmentId) => {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new ApiError(404, 'Appointment not found');
  }

  // Recalculate queue so timing status (e.g. late patient or doctor delay) reflects current server clock
  const queue = await QueueScheduler.recalculateQueue(
    appointment.doctor,
    appointment.appointmentDate
  );

  if (!queue) {
    return {
      appointmentId: appointment._id,
      tokenNumber: appointment.tokenNumber,
      bookingNumber: appointment.bookingNumber,
      status: appointment.status === 'cancelled' ? 'skipped' : 'waiting',
      appointmentStatus: appointment.status,
      queuePosition: appointment.queuePosition,
      scheduledStartTime: appointment.timeSlot?.start || null,
      scheduledEndTime: appointment.timeSlot?.end || null,
      initialEstimatedStartTime: appointment.initialEstimatedStartTime,
      initialEstimatedEndTime: appointment.initialEstimatedEndTime,
      estimatedConsultationStartTime: appointment.estimatedConsultationStartTime,
      estimatedConsultationEndTime: appointment.estimatedConsultationEndTime,
      recommendedArrivalTime: appointment.recommendedArrivalTime,
      arrivalStatus: appointment.arrivalStatus || 'not-arrived',
      timingStatus: appointment.timingStatus || 'on-time',
      delayMinutes: appointment.delayMinutes || 0,
      aheadMinutes: appointment.aheadMinutes || 0,
      statusLabel: appointment.statusLabel || 'On Time',
      statusMessage: appointment.statusMessage || null,
      recommendedAction: appointment.recommendedAction || null,
      currentlyServingToken: 0,
      averageConsultationMinutes: appointment.consultationDurationMinutes || 15,
      queueVersion: appointment.queueVersion || 1,
      called: false,
      lastUpdatedAt: appointment.updatedAt,
    };
  }

  const entry = queue.entries.find((e) => e.appointment.toString() === appointmentId.toString());

  if (!entry) {
    return {
      appointmentId: appointment._id,
      tokenNumber: appointment.tokenNumber,
      bookingNumber: appointment.bookingNumber,
      status: 'pending',
      appointmentStatus: appointment.status,
      queuePosition: null,
      scheduledStartTime: appointment.timeSlot?.start || null,
      scheduledEndTime: appointment.timeSlot?.end || null,
      estimatedConsultationStartTime: appointment.estimatedConsultationStartTime,
      estimatedConsultationEndTime: appointment.estimatedConsultationEndTime,
      recommendedArrivalTime: appointment.recommendedArrivalTime,
      arrivalStatus: appointment.arrivalStatus || 'not-arrived',
      timingStatus: appointment.timingStatus || 'on-time',
      delayMinutes: appointment.delayMinutes || 0,
      aheadMinutes: appointment.aheadMinutes || 0,
      statusLabel: appointment.statusLabel || 'On Time',
      statusMessage: appointment.statusMessage || null,
      recommendedAction: appointment.recommendedAction || null,
      currentlyServingToken: queue.currentTokenNumber,
      averageConsultationMinutes: queue.averageConsultationMinutes,
      queueVersion: queue.queueVersion || 1,
      called: false,
      lastUpdatedAt: queue.lastRecalculatedAt || queue.updatedAt,
    };
  }

  return {
    appointmentId: appointment._id,
    tokenNumber: entry.tokenNumber,
    bookingNumber: appointment.bookingNumber,
    status: entry.status,
    appointmentStatus: appointment.status,
    queuePosition: entry.queuePosition,
    scheduledStartTime: entry.scheduledStartTime,
    scheduledEndTime: entry.scheduledEndTime,
    initialEstimatedStartTime: entry.initialEstimatedStartTime,
    initialEstimatedEndTime: entry.initialEstimatedEndTime,
    estimatedStartTime: entry.estimatedStartTime,
    estimatedEndTime: entry.estimatedEndTime,
    estimatedConsultationStartTime: entry.estimatedConsultationStartTime,
    estimatedConsultationEndTime: entry.estimatedConsultationEndTime,
    recommendedArrivalTime: entry.recommendedArrivalTime,
    estimatedWaitingMinutes: entry.estimatedWaitingMinutes,
    arrivalStatus: entry.arrivalStatus,
    timingStatus: entry.timingStatus || 'on-time',
    delayMinutes: entry.delayMinutes || 0,
    aheadMinutes: entry.aheadMinutes || 0,
    statusLabel: entry.statusLabel || 'On Time',
    statusMessage: entry.statusMessage || null,
    recommendedAction: entry.recommendedAction || null,
    currentlyServingToken: queue.currentTokenNumber,
    averageConsultationMinutes: queue.averageConsultationMinutes,
    queueVersion: queue.queueVersion || 1,
    called: ['called', 'in-consultation'].includes(entry.status),
    lastUpdatedAt: entry.lastUpdatedAt || queue.lastRecalculatedAt,
  };
};

module.exports = {
  getAppointmentById,
  getPatientAppointments,
  getDoctorAppointmentsForDate,
  getHospitalAppointments,
  updateAppointmentStatus,
  getDoctorAppointmentStats,
  getQueueEntryForAppointment,
};
