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
  const appointment = await Appointment.findById(appointmentId).select('doctor appointmentDate tokenNumber');
  if (!appointment) {
    throw new ApiError(404, 'Appointment not found');
  }

  // Refresh same-day estimates against the current time before returning them.
  const isAppointmentToday = isSameUTCDate(appointment.appointmentDate, getHospitalNow());
  const queue = isAppointmentToday
    ? await QueueScheduler.recalculateQueue(appointment.doctor, appointment.appointmentDate)
    : await Queue.findOne({
        doctor: appointment.doctor,
        date: appointment.appointmentDate,
      });

  // Find the queue for this doctor/date
  if (!queue) {
    // No queue exists for this doctor/date yet.
    return {
      appointmentId,
      tokenNumber: appointment.tokenNumber,
      status: 'waiting',
      queuePosition: null,
      estimatedConsultationStartTime: null,
      estimatedConsultationEndTime: null,
    };
  }

  // Find the entry for this appointment
  const entry = queue.entries.find((e) => e.appointment.toString() === appointmentId.toString());

  if (!entry) {
    // Entry not in queue yet (not reached this doctor/date)
    return {
      appointmentId,
      tokenNumber: appointment.tokenNumber,
      status: 'pending',
      queuePosition: null,
      estimatedConsultationStartTime: null,
      estimatedConsultationEndTime: null,
    };
  }

  // Return queue entry data
  return {
    appointmentId,
    tokenNumber: entry.tokenNumber,
    status: entry.status,
    queuePosition: entry.queuePosition,
    estimatedConsultationStartTime: entry.estimatedConsultationStartTime,
    estimatedConsultationEndTime: entry.estimatedConsultationEndTime,
    arrivalStatus: entry.arrivalStatus,
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
