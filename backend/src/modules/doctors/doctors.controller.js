const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const doctorService = require('./doctors.service');
const { USER_ROLES } = require('../../constants/enums');

const isAdminRequester = (req) => req.user?.role === USER_ROLES.ADMIN;

const createDoctor = asyncHandler(async (req, res) => {
  // Parse qualifications if it comes as JSON string from FormData
  if (req.body.qualifications && typeof req.body.qualifications === 'string') {
    try {
      req.body.qualifications = JSON.parse(req.body.qualifications);
    } catch (err) {
      console.warn('⚠️  [DOCTOR] Failed to parse qualifications JSON:', err.message);
      // If JSON parse fails, treat as single string or empty array
      req.body.qualifications = req.body.qualifications ? [req.body.qualifications] : [];
    }
  }

  // Parse availability if it comes as JSON string from FormData
  if (req.body.availability && typeof req.body.availability === 'string') {
    try {
      req.body.availability = JSON.parse(req.body.availability);
    } catch (err) {
      console.warn('⚠️  [DOCTOR] Failed to parse availability JSON:', err.message);
      req.body.availability = [];
    }
  }

  const doctor = await doctorService.createDoctor(req.body, req.file);
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { doctor },
        'Doctor account created successfully. Login credentials have been emailed.'
      )
    );
});

const getDoctors = asyncHandler(async (req, res) => {
  const { doctors, total, pagination } = await doctorService.getDoctors(
    req.query,
    isAdminRequester(req)
  );
  res
    .status(200)
    .json(new ApiResponse(200, { doctors, total, ...pagination }, 'Doctors fetched successfully.'));
});

const getDoctorById = asyncHandler(async (req, res) => {
  const doctor = await doctorService.getDoctorById(req.params.id, isAdminRequester(req));
  res.status(200).json(new ApiResponse(200, { doctor }, 'Doctor fetched successfully.'));
});

const updateDoctor = asyncHandler(async (req, res) => {
  // Parse qualifications if it comes as JSON string from FormData
  if (req.body.qualifications && typeof req.body.qualifications === 'string') {
    try {
      req.body.qualifications = JSON.parse(req.body.qualifications);
    } catch (err) {
      console.warn('⚠️  [DOCTOR] Failed to parse qualifications JSON:', err.message);
      req.body.qualifications = req.body.qualifications ? [req.body.qualifications] : [];
    }
  }

  // Parse availability if it comes as JSON string from FormData
  if (req.body.availability && typeof req.body.availability === 'string') {
    try {
      req.body.availability = JSON.parse(req.body.availability);
    } catch (err) {
      console.warn('⚠️  [DOCTOR] Failed to parse availability JSON:', err.message);
      req.body.availability = [];
    }
  }

  const doctor = await doctorService.updateDoctor(req.params.id, req.body, req.file);
  res.status(200).json(new ApiResponse(200, { doctor }, 'Doctor updated successfully.'));
});

const assignHospital = asyncHandler(async (req, res) => {
  const doctor = await doctorService.assignHospital(req.params.id, req.body.hospital);
  res.status(200).json(new ApiResponse(200, { doctor }, 'Doctor reassigned to new hospital.'));
});

const assignDepartment = asyncHandler(async (req, res) => {
  const doctor = await doctorService.assignDepartment(req.params.id, req.body.department);
  res.status(200).json(new ApiResponse(200, { doctor }, 'Doctor reassigned to new department.'));
});

const deleteDoctor = asyncHandler(async (req, res) => {
  await doctorService.softDeleteDoctor(req.params.id);
  res
    .status(200)
    .json(new ApiResponse(200, null, 'Doctor deactivated successfully.'));
});

const createUnavailability = asyncHandler(async (req, res) => {
  const doctor = await doctorService.createUnavailability(req.params.id, req.body, req.user._id);
  res
    .status(201)
    .json(
      new ApiResponse(201, { doctor }, 'Doctor unavailability period added successfully.')
    );
});

const getUnavailability = asyncHandler(async (req, res) => {
  const unavailability = await doctorService.getUnavailability(req.params.id);
  res
    .status(200)
    .json(new ApiResponse(200, { unavailability }, 'Unavailability periods fetched successfully.'));
});

const updateUnavailability = asyncHandler(async (req, res) => {
  const doctor = await doctorService.updateUnavailability(
    req.params.id,
    req.params.unavailabilityId,
    req.body
  );
  res
    .status(200)
    .json(new ApiResponse(200, { doctor }, 'Unavailability period updated successfully.'));
});

const deleteUnavailability = asyncHandler(async (req, res) => {
  const doctor = await doctorService.deleteUnavailability(
    req.params.id,
    req.params.unavailabilityId
  );
  res
    .status(200)
    .json(new ApiResponse(200, { doctor }, 'Unavailability period deleted successfully.'));
});

module.exports = {
  createDoctor,
  getDoctors,
  getDoctorById,
  updateDoctor,
  assignHospital,
  assignDepartment,
  deleteDoctor,
  createUnavailability,
  getUnavailability,
  updateUnavailability,
  deleteUnavailability,
};
