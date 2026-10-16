// Example snippet integrating slot calculation during booking
const Doctor = require('../doctors/doctors.model');
const Appointment = require('../appointments/appointments.model');
const { addMinutesToTime, timeToMinutes } = require('../../utils/datetime.util');

async function allocateNextAppointmentSlot(doctorId, appointmentDate, session) {
  // 1. Fetch doctor's configured consultation duration from database
  const doctor = await Doctor.findById(doctorId).session(session);
  if (!doctor) throw new Error('Doctor not found');
  
  // Reuse existing database duration field (fallback to 15 mins if undefined)
  const durationMinutes = doctor.consultationDurationMinutes || doctor.slotDurationMinutes || 15;
  
  // 2. Fetch existing valid appointments for the same doctor on the same date
  const existingAppointments = await Appointment.find({
    doctor: doctorId,
    appointmentDate: normalizeDateOnly(appointmentDate),
    status: { $nin: ['cancelled', 'no-show', 'expired'] }
  }).sort({ 'timeSlot.end': -1 }).session(session);

  // 3. Determine base/start time (Doctor's shift start or last appointment's end time)
  let baseStartTime = '09:00'; // Default fallback shift start
  if (doctor.availability && doctor.availability.length > 0) {
    baseStartTime = doctor.availability[0].startTime || '09:00';
  }

  if (existingAppointments.length > 0 && existingAppointments[0].timeSlot?.end) {
    baseStartTime = existingAppointments[0].timeSlot.end;
  }

  const slotStart = baseStartTime;
  const slotEnd = addMinutesToTime(slotStart, durationMinutes);

  return {
    timeSlot: { start: slotStart, end: slotEnd },
    durationMinutes
  };
}