const Joi = require('joi');

/**
 * Reusable Joi fragment for validating a Mongo ObjectId passed as a string
 * (route params, or an ObjectId reference field in a body). Centralized so
 * every module validates ObjectIds identically instead of re-writing the
 * regex in five places.
 */
const objectId = () =>
  Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .message('must be a valid ID');

/**
 * Reusable Joi fragment for password length — same rule everywhere a
 * password is set (registration, reset, and staff account creation).
 */
const passwordLength = () =>
  Joi.string()
    .min(6)
    .max(12)
    .required()
    .messages({
      'string.empty': 'Password must be between 6 and 12 characters.',
      'string.min': 'Password must be at least 6 characters long.',
      'string.max': 'Password must be no more than 12 characters long.',
      'any.required': 'Password is required.',
    });

module.exports = { objectId, passwordLength };
