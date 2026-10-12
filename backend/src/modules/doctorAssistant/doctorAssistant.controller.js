const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../errors/ApiError');
const doctorAssistantService = require('./doctorAssistant.service');

const getQueue = asyncHandler(async (req, res) => {
  const { doctor, date } = req.query;
  const { assignedDoctor } = req.user;

  // SECURITY: Doctor assistants can ONLY access their assigned doctor's queue
  if (!assignedDoctor) {
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  // Get the doctor ID (handle both string and populated object)
  const assignedDoctorId = assignedDoctor._id || assignedDoctor;

  if (doctor && doctor !== assignedDoctorId.toString()) {
    throw new ApiError(403, "You can only access your assigned doctor's queue.");
  }

  // Extract hospital ID from populated object or use if already a string/ID
  const hospitalId = req.user.hospital?._id || req.user.hospital;

  const queueView = await doctorAssistantService.getQueue(
    assignedDoctorId,
    date,
    hospitalId,
    assignedDoctorId
  );
  res.status(200).json(new ApiResponse(200, queueView, 'Queue fetched successfully.'));
});

const callNextPatient = asyncHandler(async (req, res) => {
  const { doctor, date } = req.body;
  const { assignedDoctor } = req.user;

  // SECURITY: Doctor assistants can ONLY access their assigned doctor's queue
  if (!assignedDoctor) {
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  const assignedDoctorId = assignedDoctor._id || assignedDoctor;

  if (doctor && doctor !== assignedDoctorId.toString()) {
    throw new ApiError(403, "You can only access your assigned doctor's queue.");
  }

  // Extract hospital ID from populated object or use if already a string/ID
  const hospitalId = req.user.hospital?._id || req.user.hospital;

  const { calledEntry, queue } = await doctorAssistantService.callNextPatient(
    assignedDoctorId,
    date,
    hospitalId,
    assignedDoctorId
  );
  res.status(200).json(
    new ApiResponse(
      200,
      { calledEntry, currentTokenNumber: queue.currentTokenNumber },
      `Token #${calledEntry.tokenNumber} called.`
    )
  );
});

const startConsultation = asyncHandler(async (req, res) => {
  console.log('🏥 [START CONSULTATION] Controller reached');
  console.log('  appointmentId:', req.params.appointmentId);
  console.log('  user._id:', req.user?._id);
  console.log('  assignedDoctor:', req.user?.assignedDoctor);

  const { assignedDoctor } = req.user;

  if (!assignedDoctor) {
    console.error('❌ [START CONSULTATION] No assignedDoctor');
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  // Extract ID from populated object or use if already a string/ID
  const assignedDoctorId = assignedDoctor._id || assignedDoctor;
  const hospitalId = req.user.hospital?._id || req.user.hospital;

  console.log('✅ [START CONSULTATION] assignedDoctor OK, calling service...');
  const { appointment, entry } = await doctorAssistantService.startConsultation(
    req.params.appointmentId,
    hospitalId,
    assignedDoctorId
  );
  console.log('✅ [START CONSULTATION] Service completed successfully');
  res
    .status(200)
    .json(new ApiResponse(200, { appointment, entry }, 'Consultation started.'));
});

const completeConsultation = asyncHandler(async (req, res) => {
  const { assignedDoctor } = req.user;

  if (!assignedDoctor) {
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  // Extract ID from populated object or use if already a string/ID
  const assignedDoctorId = assignedDoctor._id || assignedDoctor;
  const hospitalId = req.user.hospital?._id || req.user.hospital;

  const { appointment, entry, averageConsultationMinutes } =
    await doctorAssistantService.completeConsultation(
      req.params.appointmentId,
      hospitalId,
      assignedDoctorId
    );
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { appointment, entry, averageConsultationMinutes },
        'Consultation completed.'
      )
    );
});

const skipPatient = asyncHandler(async (req, res) => {
  const { assignedDoctor } = req.user;

  if (!assignedDoctor) {
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  // Extract ID from populated object or use if already a string/ID
  const assignedDoctorId = assignedDoctor._id || assignedDoctor;
  const hospitalId = req.user.hospital?._id || req.user.hospital;

  const { entry } = await doctorAssistantService.skipPatient(
    req.params.appointmentId,
    hospitalId,
    assignedDoctorId
  );
  res.status(200).json(new ApiResponse(200, { entry }, `Token #${entry.tokenNumber} skipped.`));
});

const pauseQueue = asyncHandler(async (req, res) => {
  const { doctor, date } = req.body;
  const { assignedDoctor } = req.user;

  if (!assignedDoctor) {
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  const assignedDoctorId = assignedDoctor._id || assignedDoctor;
  const hospitalId = req.user.hospital?._id || req.user.hospital;

  if (doctor && doctor !== assignedDoctorId.toString()) {
    throw new ApiError(403, "You can only pause your assigned doctor's queue.");
  }

  const queue = await doctorAssistantService.pauseQueue(
    assignedDoctorId,
    date,
    hospitalId,
    assignedDoctorId
  );
  res.status(200).json(new ApiResponse(200, { queue }, 'Queue paused.'));
});

const resumeQueue = asyncHandler(async (req, res) => {
  const { doctor, date } = req.body;
  const { assignedDoctor } = req.user;

  if (!assignedDoctor) {
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  const assignedDoctorId = assignedDoctor._id || assignedDoctor;
  const hospitalId = req.user.hospital?._id || req.user.hospital;

  if (doctor && doctor !== assignedDoctorId.toString()) {
    throw new ApiError(403, "You can only resume your assigned doctor's queue.");
  }

  const queue = await doctorAssistantService.resumeQueue(
    assignedDoctorId,
    date,
    hospitalId,
    assignedDoctorId
  );
  res.status(200).json(new ApiResponse(200, { queue }, 'Queue resumed.'));
});

const setAverageConsultationTime = asyncHandler(async (req, res) => {
  const { doctor, date, averageConsultationMinutes } = req.body;
  const { assignedDoctor } = req.user;

  if (!assignedDoctor) {
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  const assignedDoctorId = assignedDoctor._id || assignedDoctor;
  const hospitalId = req.user.hospital?._id || req.user.hospital;

  if (doctor && doctor !== assignedDoctorId.toString()) {
    throw new ApiError(403, "You can only configure your assigned doctor's settings.");
  }

  const queue = await doctorAssistantService.setAverageConsultationMinutes(
    assignedDoctorId,
    date,
    hospitalId,
    averageConsultationMinutes,
    assignedDoctorId
  );
  res
    .status(200)
    .json(new ApiResponse(200, { queue }, 'Average consultation time updated; queue recalculated.'));
});

const createUnavailability = asyncHandler(async (req, res) => {
  const { startDate, endDate, reason, notes } = req.body;
  const { assignedDoctor } = req.user;

  if (!assignedDoctor) {
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  const unavailability = await doctorAssistantService.createUnavailability(
    assignedDoctor,
    startDate,
    endDate,
    reason,
    notes,
    req.user._id,
    req.user.hospital
  );
  res
    .status(201)
    .json(new ApiResponse(201, unavailability, 'Unavailability period created successfully.'));
});

const getUnavailability = asyncHandler(async (req, res) => {
  const { assignedDoctor } = req.user;

  if (!assignedDoctor) {
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  const unavailabilities = await doctorAssistantService.getUnavailability(
    assignedDoctor,
    req.user.hospital
  );
  res
    .status(200)
    .json(new ApiResponse(200, unavailabilities, 'Unavailability periods fetched successfully.'));
});

const updateUnavailability = asyncHandler(async (req, res) => {
  const { startDate, endDate, reason, notes } = req.body;
  const { assignedDoctor } = req.user;

  if (!assignedDoctor) {
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  const unavailability = await doctorAssistantService.updateUnavailability(
    req.params.unavailabilityId,
    assignedDoctor,
    { startDate, endDate, reason, notes },
    req.user.hospital
  );
  res
    .status(200)
    .json(new ApiResponse(200, unavailability, 'Unavailability period updated successfully.'));
});

const deleteUnavailability = asyncHandler(async (req, res) => {
  const { assignedDoctor } = req.user;

  if (!assignedDoctor) {
    throw new ApiError(403, 'Your account is not assigned to a doctor.');
  }

  await doctorAssistantService.deleteUnavailability(
    req.params.unavailabilityId,
    assignedDoctor,
    req.user.hospital
  );
  res
    .status(200)
    .json(new ApiResponse(200, null, 'Unavailability period deleted successfully.'));
});

module.exports = {
  getQueue,
  callNextPatient,
  startConsultation,
  completeConsultation,
  skipPatient,
  pauseQueue,
  resumeQueue,
  setAverageConsultationTime,
  createUnavailability,
  getUnavailability,
  updateUnavailability,
  deleteUnavailability,
};
