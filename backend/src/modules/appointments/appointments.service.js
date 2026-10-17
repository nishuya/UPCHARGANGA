/**
 * APPOINTMENTS SERVICE
 * ====================
 * Business logic for appointment management:
 * - Booking appointments
 * - Retrieving appointment details
 * - Updating appointment status
 * - Cancellation with notifications
 *
 * Note: Queue-specific logic is in QueueService
 * Reception-specific logic is in ReceptionService
 * This service handles core appointment operations
 */

const Appointment = require('./appointments.model');
const Doctor = require('../doctors/doctors.model');
const Patient = require('../patients/patients.model');
const Queue = require('../queue/queue.model');
const QueueScheduler = require('../queue/queue.scheduler.service');
const ApiError = require('../../errors/ApiError');
const {
  normalizeDateOnly,
  getHospitalNow,
  isSameUTCDate,
  getWeekdayName,
} = require('../../utils/datetime.util');
const { APPOINTMENT_STATUS } = require('../../constants/enums');

/**
 * Get appointment by ID
 */
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

/**
 * Get all appointments for a patient
 */
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

/**
 * Get all appointments for a doctor on a specific date
 */
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

/**
 * Get all appointments for a hospital
 */
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

/**
 * Update appointment status
 */
const updateAppointmentStatus = async (appointmentId, newStatus, reason = null) => {
  const appointment = await getAppointmentById(appointmentId);

  // Validate status transition
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

/**
 * Get appointment statistics for a doctor
 */
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
    completed: appointments.filter(a => a.status === APPOINTMENT_STATUS.COMPLETED).length,
    pending: appointments.filter(a => a.status === APPOINTMENT_STATUS.PENDING).length,
    confirmed: appointments.filter(a => a.status === APPOINTMENT_STATUS.CONFIRMED).length,
    cancelled: appointments.filter(a => a.status === APPOINTMENT_STATUS.CANCELLED).length,
    noShow: appointments.filter(a => a.status === APPOINTMENT_STATUS.NO_SHOW).length,
  };

  return stats;
};

/**
 * Get the queue entry for an appointment (real-time queue data with estimates)
 * Used by patient portal to display current queue position and estimated times
 */
const getQueueEntryForAppointment = async (appointmentId) => {
  const appointment = await Appointment.findById(appointmentId).select(
    'doctor appointmentDate tokenNumber status'
  );
  if (!appointment) {
    throw new ApiError(404, 'Appointment not found');
  }

  const appointmentDay = normalizeDateOnly(appointment.appointmentDate);
  const today = normalizeDateOnly(getHospitalNow());
  const isAppointmentPast = appointmentDay < today;
  const isAppointmentToday = isSameUTCDate(appointmentDay, today);
  const [doctor, existingQueue] = await Promise.all([
    Doctor.findById(appointment.doctor, 'availability isAvailableToday unavailability isActive'),
    Queue.findOne({
      doctor: appointment.doctor,
      date: appointmentDay,
    }),
  ]);
  const isDoctorUnavailable =
    !doctor ||
    doctor.isActive === false ||
    (isAppointmentToday && doctor.isAvailableToday === false) ||
    doctor.unavailability?.some((period) => {
      const start = normalizeDateOnly(period.startDate);
      const end = normalizeDateOnly(period.endDate);
      return appointmentDay >= start && appointmentDay <= end;
    }) ||
    !doctor.availability?.some((schedule) => schedule.day === getWeekdayName(appointmentDay));
  const terminalAppointmentStatuses = ['completed', 'cancelled', 'expired', 'no-show'];
  const noQueueEstimateStatus = terminalAppointmentStatuses.includes(appointment.status)
    ? appointment.status
    : isAppointmentPast
      ? 'past'
      : isDoctorUnavailable
        ? 'doctor-unavailable'
        : 'not-started';

  if (!existingQueue) {
    return {
      appointmentId,
      tokenNumber: appointment.tokenNumber,
      status: appointment.status,
      queuePosition: null,
      currentServingTokenNumber: null,
      currentServingStatus: null,
      currentTokenNumber: 0,
      averageConsultationMinutes: null,
      queueStatus: null,
      estimateStatus: noQueueEstimateStatus,
      estimatedConsultationStartTime: null,
      estimatedConsultationEndTime: null,
      updatedAt: new Date(),
    };
  }

  // Rebuild the live projection from the queue's current progress on today and
  // future appointment dates. The appointment's legacy ETA fields are never
  // consulted or updated.
  const queue =
    !isAppointmentPast && !isDoctorUnavailable
      ? await QueueScheduler.recalculateQueue(appointment.doctor, appointmentDay, undefined, {
          persist: false,
        })
      : existingQueue;

  if (!queue) {
    return {
      appointmentId,
      tokenNumber: appointment.tokenNumber,
      status: appointment.status,
      queuePosition: null,
      currentServingTokenNumber: null,
      currentServingStatus: null,
      currentTokenNumber: 0,
      averageConsultationMinutes: null,
      queueStatus: null,
      estimateStatus: noQueueEstimateStatus,
      estimatedConsultationStartTime: null,
      estimatedConsultationEndTime: null,
      updatedAt: new Date(),
    };
  }

  const entry = queue.entries.find((e) => e.appointment.toString() === appointmentId.toString());
  const currentlyServingEntry =
    queue.entries.find((e) => e.status === 'in-consultation') ||
    queue.entries.find((e) => e.status === 'called');

  if (!entry) {
    return {
      appointmentId,
      tokenNumber: appointment.tokenNumber,
      status: appointment.status,
      queuePosition: null,
      currentServingTokenNumber: currentlyServingEntry?.tokenNumber ?? null,
      currentServingStatus: currentlyServingEntry?.status ?? null,
      currentTokenNumber: queue.currentTokenNumber,
      averageConsultationMinutes: queue.averageConsultationMinutes,
      queueStatus: queue.status,
      estimateStatus: isAppointmentPast ? 'past' : 'not-started',
      estimatedConsultationStartTime: null,
      estimatedConsultationEndTime: null,
      updatedAt: new Date(),
    };
  }

  const terminalStatuses = ['completed', 'skipped', 'no-show', 'cancelled', 'expired'];
  const isTerminal = terminalStatuses.includes(entry.status) ||
    terminalStatuses.includes(appointment.status);
  const canEstimate =
    !isAppointmentPast &&
    !isDoctorUnavailable &&
    queue.status === 'active' &&
    !isTerminal &&
    !['called', 'in-consultation'].includes(entry.status);
  let estimateStatus = entry.status;

  if (entry.status === 'called') {
    estimateStatus = 'called';
  } else if (entry.status === 'in-consultation' || appointment.status === 'in-consultation') {
    estimateStatus = 'in-consultation';
  } else if (isTerminal) {
    estimateStatus = terminalAppointmentStatuses.includes(appointment.status)
      ? appointment.status
      : entry.status;
  } else if (isAppointmentPast) {
    estimateStatus = 'past';
  } else if (isDoctorUnavailable) {
    estimateStatus = 'doctor-unavailable';
  } else if (queue.status === 'paused') {
    estimateStatus = 'queue-paused';
  } else if (queue.status === 'closed') {
    estimateStatus = 'queue-closed';
  } else if (entry.queuePosition === 1 && !currentlyServingEntry) {
    estimateStatus = 'next';
  } else if (!canEstimate) {
    estimateStatus = 'waiting';
  }

  return {
    appointmentId,
    tokenNumber: entry.tokenNumber,
    status: entry.status,
    arrivalStatus: entry.arrivalStatus,
    queuePosition: isTerminal || isAppointmentPast ? null : entry.queuePosition,
    queueEntriesAhead: isTerminal || entry.queuePosition == null ? null : Math.max(entry.queuePosition - 1, 0),
    currentServingTokenNumber: currentlyServingEntry?.tokenNumber ?? null,
    currentServingStatus: currentlyServingEntry?.status ?? null,
    currentTokenNumber: queue.currentTokenNumber,
    averageConsultationMinutes: queue.averageConsultationMinutes,
    queueStatus: queue.status,
    estimateStatus,
    estimatedConsultationStartTime: canEstimate ? entry.estimatedConsultationStartTime : null,
    estimatedConsultationEndTime: canEstimate ? entry.estimatedConsultationEndTime : null,
    updatedAt: new Date(),
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
