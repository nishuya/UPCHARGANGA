const Hospital = require('../hospitals/hospitals.model');
const Department = require('../departments/departments.model');
const Doctor = require('../doctors/doctors.model');
const Appointment = require('../appointments/appointments.model');
const Queue = require('../queue/queue.model');
const QueueService = require('../queue/queue.service');
const ApiError = require('../../errors/ApiError');
const ApiFeatures = require('../../utils/apiFeatures.util');
const withTransaction = require('../../utils/withTransaction.util');
const { normalizeDateOnly, getWeekdayName, getHospitalNow, combineDateAndTime } = require('../../utils/datetime.util');
const {
  APPOINTMENT_STATUS,
  CONSULTATION_TYPE,
  QUEUE_ENTRY_STATUS,
  BOOKING_CONSTRAINTS,
} = require('../../constants/enums');
const { broadcastQueueRecalculation } = require('../../sockets/socketEmitter');

const MAX_BOOKING_ADVANCE_DAYS = 90;

const APPOINTMENT_POPULATE = [
  {
    path: 'doctor',
    select: 'specialization consultationFee user',
    populate: { path: 'user', select: 'fullName' }
  },
  {
    path: 'hospital',
    select: 'name address contact' // Select entire nested objects, not specific fields
  },
  { path: 'department', select: 'name' },
];

/**
 * Loads and validates hospital → department → doctor as a consistent
 * chain (each must be active AND actually belong to the one above it).
 * This is PATIENT-MODULE orchestration — it has nothing to do with queue
 * mechanics, which is why it lives here and not in QueueService.
 */
const loadAndValidateChain = async (hospitalId, departmentId, doctorId) => {
  const [hospital, department, doctor] = await Promise.all([
    Hospital.findOne({ _id: hospitalId, isActive: true }),
    Department.findOne({ _id: departmentId, isActive: true }),
    Doctor.findOne({ _id: doctorId, isActive: true }).populate('user', 'fullName'),
  ]);

  if (!hospital) throw new ApiError(404, 'Hospital not found or is currently inactive.');
  if (!department) throw new ApiError(404, 'Department not found or is currently inactive.');
  if (!doctor) throw new ApiError(404, 'Doctor not found or is currently inactive.');

  if (department.hospital.toString() !== hospitalId) {
    throw new ApiError(400, 'Selected department does not belong to the selected hospital.');
  }
  if (doctor.hospital.toString() !== hospitalId || doctor.department.toString() !== departmentId) {
    throw new ApiError(400, 'Selected doctor does not belong to the selected hospital/department.');
  }

  return { hospital, department, doctor };
};

/**
 * Checks if a doctor is unavailable on a specific date due to
 * a registered unavailability period.
 *
 * @param {Object} doctor - Doctor document
 * @param {Date} appointmentDate - Appointment date to check
 * @returns {Object|null} - Unavailability period if found, null otherwise
 */
const checkDoctorUnavailability = (doctor, appointmentDate) => {
  const normalizedDate = normalizeDateOnly(appointmentDate);

  for (const unavail of doctor.unavailability || []) {
    const startDate = normalizeDateOnly(unavail.startDate);
    const endDate = normalizeDateOnly(unavail.endDate);

    // Check if appointment date falls within unavailability period
    if (normalizedDate >= startDate && normalizedDate <= endDate) {
      return unavail;
    }
  }

  return null;
};

/**
 * Orchestrates a booking: validates the patient-facing chain, then
 * delegates every actual queue-mechanics decision (token number, slot
 * time, booking number, queue entry creation, and this patient's own
 * ETA) to QueueService — the single source of truth for that logic.
 *
 * Also enforces booking window constraints (max 3 days advance) and
 * checks doctor unavailability.
 */
const bookAppointment = async (patientId, payload) => {
  const { hospital, department, doctor, appointmentDate, reasonForVisit, symptoms } = payload;

  const chain = await loadAndValidateChain(hospital, department, doctor);

  const normalizedDate = normalizeDateOnly(appointmentDate);
  const now = getHospitalNow();
  const today = normalizeDateOnly(now);

  // --- Booking window validation ---
  if (normalizedDate < today) {
    throw new ApiError(400, 'Cannot book an appointment for a past date.');
  }

  // Check maximum advance (cannot book more than MAX_ADVANCE_DAYS ahead)
  // Allows same-day, next-day, and up to 3 days from today
  const maxAdvanceDate = new Date(today);
  maxAdvanceDate.setUTCDate(maxAdvanceDate.getUTCDate() + BOOKING_CONSTRAINTS.MAX_ADVANCE_DAYS);
  if (normalizedDate > maxAdvanceDate) {
    throw new ApiError(
      400,
      `Appointments can only be booked up to ${BOOKING_CONSTRAINTS.MAX_ADVANCE_DAYS} days in advance.`
    );
  }

  // --- Check doctor unavailability ---
  const unavailPeriod = checkDoctorUnavailability(chain.doctor, normalizedDate);
  if (unavailPeriod) {
    throw new ApiError(
      400,
      `Dr. ${chain.doctor.user?.fullName ?? 'this doctor'} is unavailable on this date (${unavailPeriod.reason}). Please choose another date.`
    );
  }

  const weekday = getWeekdayName(normalizedDate);
  const daySchedule = chain.doctor.availability.find((slot) => slot.day === weekday);
  if (!daySchedule) {
    throw new ApiError(400, `Dr. ${chain.doctor.user?.fullName ?? 'this doctor'} is not available on ${weekday}s.`);
  }

  // SECURITY FIX: Ensure maxPatients is set (should default to 30 from schema)
  const maxPatients = daySchedule.maxPatients || 30;

  console.log('📅 [BOOKING] Day of week:', weekday);
  console.log('📅 [BOOKING] Available days:', chain.doctor.availability.map(a => a.day));
  console.log('📅 [BOOKING] Day schedule found:', !!daySchedule);
  console.log('📅 [BOOKING] Max patients from schedule:', daySchedule.maxPatients);
  console.log('📅 [BOOKING] Final maxPatients (with fallback):', maxPatients);

  if (!maxPatients || maxPatients < 1) {
    console.error(`❌ [BOOKING] Doctor ${chain.doctor._id} has invalid maxPatients: ${maxPatients}`);
    throw new ApiError(500, 'Doctor schedule is not properly configured. Please contact support.');
  }

  const isToday = normalizedDate.getTime() === today.getTime();
  if (isToday && !chain.doctor.isAvailableToday) {
    throw new ApiError(400, 'This doctor is unavailable today. Please choose another date.');
  }

  const runBookingTransaction = async (work) => {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await withTransaction(work);
      } catch (err) {
        lastError = err;
        const retryable =
          err?.errorLabels?.includes('TransientTransactionError') ||
          err?.code === 112 ||
          err?.codeName === 'WriteConflict';
        if (!retryable || attempt === 3) {
          throw err;
        }
      }
    }
    throw lastError;
  };

  // --- From here on, every decision is delegated to QueueService ---
  const result = await runBookingTransaction(async (session) => {
    // CRITICAL: Check slot availability BEFORE incrementing token counter
    // Count ACTIVE (non-cancelled) appointments for this doctor on this date
    const activeAppointmentCount = await Appointment.countDocuments({
      doctor: chain.doctor._id,
      appointmentDate: normalizedDate,
      status: { $ne: APPOINTMENT_STATUS.CANCELLED },
      isActive: true,
    }).session(session);

    console.log('📋 [BOOKING] Checking slot availability...');
    console.log('   Doctor ID:', chain.doctor._id);
    console.log('   Appointment Date:', normalizedDate);
    console.log('   Active (non-cancelled) appointments:', activeAppointmentCount);
    console.log('   Max patients allowed:', maxPatients);
    console.log('   Can book? (active < max):', activeAppointmentCount < maxPatients);

    // Check BEFORE assigning token
    if (activeAppointmentCount >= maxPatients) {
      console.error(`❌ [BOOKING] Slot full - ${activeAppointmentCount} active >= ${maxPatients} max`);
      throw new ApiError(409, 'All slots for this doctor on the selected date are fully booked.');
    }

    console.log('✅ [BOOKING] Slot available, proceeding with token assignment');

    // ATOMIC: Get next token within the transaction to prevent race conditions
    const tokenNumber = await QueueService.getNextTokenNumber(chain.doctor._id, normalizedDate, session);

    const timeSlot = await QueueService.allocateScheduledSlot(
      daySchedule,
      tokenNumber,
      normalizedDate,
      { doctorId: chain.doctor._id, session }
    );
    const bookingNumber = QueueService.generateBookingNumber(chain.doctor._id, normalizedDate, tokenNumber);

    // Calculate cutoff time: appointment start time + CONSULTATION_WINDOW_HOURS
    const appointmentStartTime = combineDateAndTime(normalizedDate, timeSlot.start);
    const appointmentEndTime = combineDateAndTime(normalizedDate, timeSlot.end);
    const cutoffTime = new Date(appointmentStartTime);
    cutoffTime.setUTCHours(cutoffTime.getUTCHours() + BOOKING_CONSTRAINTS.CONSULTATION_WINDOW_HOURS);

    let appointmentId;

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
          // NEW: Set persistent estimated consultation times for patient display
          estimatedConsultationStartTime: appointmentStartTime,
          estimatedConsultationEndTime: appointmentEndTime,
        },
      ],
      { session }
    );
    appointmentId = createdAppointment._id;

    await QueueService.addEntry(
      {
        hospitalId: chain.hospital._id,
        departmentId: chain.department._id,
        doctorId: chain.doctor._id,
        date: normalizedDate,
        appointmentId,
        patientId,
        tokenNumber,
        averageConsultationMinutes: daySchedule.slotDurationMinutes,
        timeSlot, // Pass time slot for attendance window calculation
      },
      session
    );

    // Recalculating immediately after adding the entry computes THIS
    // patient's own queuePosition/ETA through the exact same code path
    // used for every subsequent recalculation — one formula, no drift.
    const recalculatedQueue = await QueueService.recalculateQueue(chain.doctor._id, normalizedDate, session);

    const appointment = await Appointment.findById(appointmentId).populate(APPOINTMENT_POPULATE).session(session);
    const queue = await Queue.findOne({
      doctor: chain.doctor._id,
      date: normalizedDate,
    }).session(session);
    const myEntry = queue.entries.find((e) => e.appointment.toString() === appointmentId.toString());

    return {
      appointment,
      bookingNumber,
      queueNumber: tokenNumber,
      doctorId: chain.doctor._id,
      date: normalizedDate,
      recalculatedQueue,
      // NEW: Return estimated consultation time (not deprecated wait time)
      estimatedConsultationStartTime: myEntry.estimatedConsultationStartTime,
      estimatedConsultationEndTime: myEntry.estimatedConsultationEndTime,
      queueStatus: {
        currentlyServingToken: queue.currentTokenNumber,
        totalTokensIssued: queue.totalTokensIssued,
        queuePosition: myEntry.queuePosition,
        // Legacy field kept for backward compatibility (not used in new display)
        estimatedWaitingMinutes: myEntry.estimatedWaitingMinutes,
      },
    };
  });

  // Broadcast AFTER transaction commits — notifies all staff and other patients
  // that a new patient has been added and queue positions have shifted
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
 * Cancels the patient's own appointment. Marks the matching Queue entry
 * as 'skipped' (removing it from the waiting pool) and delegates to
 * QueueService to recalculate every remaining patient's position/ETA,
 * since one fewer person ahead of them changes their numbers too.
 */
const cancelMyAppointment = async (patientId, appointmentId, cancellationReason) => {
  console.log('🚫 [CANCEL] Starting cancellation for appointment:', appointmentId, 'by patient:', patientId);

  const appointment = await Appointment.findOne({ _id: appointmentId, patient: patientId });
  console.log('🔍 [CANCEL] Found appointment:', appointment ? 'YES' : 'NO');

  if (!appointment) {
    console.error('❌ [CANCEL] Appointment not found');
    throw new ApiError(404, 'Appointment not found.');
  }

  console.log('📊 [CANCEL] Appointment status:', appointment.status);

  if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
    console.error('❌ [CANCEL] Already cancelled');
    throw new ApiError(400, 'This appointment is already cancelled.');
  }

  if (appointment.status === APPOINTMENT_STATUS.COMPLETED) {
    console.error('❌ [CANCEL] Already completed');
    throw new ApiError(400, 'Cannot cancel a completed appointment.');
  }

  // Allow cancellation even if appointment time has passed - patient can be late
  // Only block if appointment is COMPLETED by the doctor
  console.log('✅ [CANCEL] Appointment can be cancelled (not completed yet)');

  return withTransaction(async (session) => {
    appointment.status = APPOINTMENT_STATUS.CANCELLED;
    appointment.cancelledBy = patientId;
    appointment.cancellationReason = cancellationReason || null;
    await appointment.save({ session });
    console.log('💾 [CANCEL] Appointment status saved as CANCELLED');

    await Queue.updateOne(
      { doctor: appointment.doctor, date: appointment.appointmentDate },
      { $set: { 'entries.$[elem].status': QUEUE_ENTRY_STATUS.SKIPPED } },
      { arrayFilters: [{ 'elem.appointment': appointment._id }], session }
    );
    console.log('📋 [CANCEL] Queue entry marked as SKIPPED');

    await QueueService.recalculateQueue(appointment.doctor, appointment.appointmentDate, session);
    console.log('🔄 [CANCEL] Queue recalculated');

    console.log('✅ [CANCEL] Cancellation complete');
    return appointment;
  });
}

  

module.exports = {
  bookAppointment,
  getMyAppointments,
  getMyAppointmentById,
  cancelMyAppointment,
};
