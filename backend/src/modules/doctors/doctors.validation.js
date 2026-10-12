const Joi = require('joi');
const { objectId } = require('../../validators/common.validation');
const { WEEKDAYS } = require('../../constants/enums');

const availabilitySchema = Joi.object({
  day: Joi.string().valid(...WEEKDAYS).required(),
  startTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
  endTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
  slotDurationMinutes: Joi.number().min(5).max(120).default(15),
  maxPatients: Joi.number().min(1).max(200).default(30), // Auto-defaults to 30 if not provided
});

// Creates the doctor's USER (auth) account and Doctor (professional)
// profile in one call — account fields + professional fields together.
const createDoctorSchema = Joi.object({
  // Account/identity fields
  fullName: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().lowercase().email().required(),
  phone: Joi.string().trim().pattern(/^\+?[0-9]{10,15}$/).required(),
  gender: Joi.string().valid('male', 'female', 'other'),
  dateOfBirth: Joi.date().less('now'),

  // Professional/domain fields
  hospital: objectId().required(),
  department: objectId().required(),
  specialization: Joi.string().trim().min(2).max(100).required(),
  qualifications: Joi.array().items(Joi.string().trim()).default([]), // Optional, defaults to empty
  experienceYears: Joi.number().min(0).max(70).default(0),
  licenseNumber: Joi.string().trim().min(3).max(50).required(),
  consultationFee: Joi.number().min(0).required(),
  // FLEXIBILITY FIX: availability is optional; if not provided, backend will auto-generate default schedule
  availability: Joi.array().items(availabilitySchema).default([]),
});

// Professional fields only. Deliberately excludes `hospital`/`department`
// (use the dedicated assign-hospital / assign-department endpoints, which
// contain cross-collection validation a plain PATCH shouldn't silently
// skip) and excludes account fields like email/phone (those belong to a
// future dedicated user-profile-update endpoint, not the doctor module).
const updateDoctorSchema = Joi.object({
  specialization: Joi.string().trim().min(2).max(100),
  qualifications: Joi.array().items(Joi.string().trim()),
  experienceYears: Joi.number().min(0).max(70),
  licenseNumber: Joi.string().trim().min(3).max(50),
  consultationFee: Joi.number().min(0),
  availability: Joi.array().items(availabilitySchema),
  isAvailableToday: Joi.boolean(),
  isActive: Joi.boolean(),
}).min(1);

const assignHospitalSchema = Joi.object({
  hospital: objectId().required(),
});

const assignDepartmentSchema = Joi.object({
  department: objectId().required(),
});

const createUnavailabilitySchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  reason: Joi.string()
    .valid('vacation', 'conference', 'emergency', 'other')
    .required(),
  notes: Joi.string().trim().max(500),
});

const updateUnavailabilitySchema = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso(),
  reason: Joi.string().valid('vacation', 'conference', 'emergency', 'other'),
  notes: Joi.string().trim().max(500),
}).min(1);

module.exports = {
  createDoctorSchema,
  updateDoctorSchema,
  assignHospitalSchema,
  assignDepartmentSchema,
  createUnavailabilitySchema,
  updateUnavailabilitySchema,
};
