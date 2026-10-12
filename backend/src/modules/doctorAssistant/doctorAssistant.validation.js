const Joi = require('joi');
const { objectId } = require('../../validators/common.validation');

const queueQuerySchema = Joi.object({
  doctor: objectId().required(),
  date: Joi.date(), // optional — defaults to today in the service layer
});

const doctorDateSchema = Joi.object({
  doctor: objectId().required(),
  date: Joi.date(),
});

const setAverageConsultationTimeSchema = Joi.object({
  doctor: objectId().required(),
  date: Joi.date(),
  averageConsultationMinutes: Joi.number().min(1).max(180).required(),
});

const createUnavailabilitySchema = Joi.object({
  startDate: Joi.date().required(),
  endDate: Joi.date().min(Joi.ref('startDate')).required(),
  reason: Joi.string().valid('vacation', 'conference', 'emergency', 'other').required(),
  notes: Joi.string().optional().allow('').max(500),
});

const updateUnavailabilitySchema = Joi.object({
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  reason: Joi.string().valid('vacation', 'conference', 'emergency', 'other').optional(),
  notes: Joi.string().optional().allow('').max(500),
});

module.exports = {
  queueQuerySchema,
  doctorDateSchema,
  setAverageConsultationTimeSchema,
  createUnavailabilitySchema,
  updateUnavailabilitySchema,
};
