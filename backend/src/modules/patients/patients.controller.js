const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../errors/ApiError');
const patientService = require('./patients.service');

const bookAppointment = asyncHandler(async (req, res) => {
  const result = await patientService.bookAppointment(req.user._id, req.body);

  res.status(201).json(
    new ApiResponse(
      201,
      {
        appointment: result.appointment,
        bookingNumber: result.bookingNumber,
        queueNumber: result.queueNumber,
        estimatedReportingTime: result.estimatedReportingTime,
        queueStatus: result.queueStatus,
      },
      'Appointment booked successfully.'
    )
  );
});

const getMyAppointments = asyncHandler(async (req, res) => {
  const { appointments, total, pagination } = await patientService.getMyAppointments(
    req.user._id,
    req.query
  );
  res
    .status(200)
    .json(
      new ApiResponse(200, { appointments, total, ...pagination }, 'Appointments fetched successfully.')
    );
});

/**
 * GET /api/patients/appointments/:id
 *
 * SECURITY: req.appointment is already validated by requirePatientResourceAccess middleware
 * which ensures the appointment belongs to the requesting patient.
 */
const getMyAppointmentById = asyncHandler(async (req, res) => {
  const appointment = req.appointment; // Populated by requirePatientResourceAccess middleware

  if (!appointment) {
    throw new ApiError(404, 'Appointment not found.');
  }

  res.status(200).json(new ApiResponse(200, { appointment }, 'Appointment fetched successfully.'));
});

/**
 * GET /api/patients/appointments/:id/queue-entry
 *
 * SECURITY: req.appointment is already validated by requirePatientResourceAccess middleware
 * which ensures the appointment belongs to the requesting patient.
 */
const getAppointmentQueueEntry = asyncHandler(async (req, res) => {
  const appointment = req.appointment; // Populated by requirePatientResourceAccess middleware

  if (!appointment) {
    throw new ApiError(404, 'Appointment not found.');
  }

  const appointmentService = require('../appointments/appointments.service');
  const queueEntry = await appointmentService.getQueueEntryForAppointment(appointment._id);

  res.status(200).json(new ApiResponse(200, { queueEntry }, 'Queue entry fetched successfully.'));
});

/**
 * PATCH /api/patients/appointments/:id/cancel
 *
 * SECURITY:
 * - Patient ID is ALWAYS taken from req.user._id (never from request body)
 * - Appointment ID is validated by requirePatientResourceAccess middleware
 */
const cancelAppointment = asyncHandler(async (req, res) => {
  const appointment = await patientService.cancelMyAppointment(
    req.user._id,  // ✅ CRITICAL: From authenticated token, never from request
    req.params.id,
    req.body.cancellationReason
  );
  res.status(200).json(new ApiResponse(200, { appointment }, 'Appointment cancelled successfully.'));
});

module.exports = {
  bookAppointment,
  getMyAppointments,
  getMyAppointmentById,
  cancelAppointment,
  getAppointmentQueueEntry,
};

