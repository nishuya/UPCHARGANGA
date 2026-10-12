const Hospital = require('./hospitals.model');
const City = require('../cities/cities.model');
const Department = require('../departments/departments.model');
const Doctor = require('../doctors/doctors.model');
const ApiError = require('../../errors/ApiError');
const ApiFeatures = require('../../utils/apiFeatures.util');
const withTransaction = require('../../utils/withTransaction.util');
const { uploadImage, deleteImage, replaceImage } = require('../../utils/cloudinary.util');

const assertCityExists = async (cityId) => {
  const city = await City.findById(cityId);
  if (!city) {
    throw new ApiError(404, 'City not found. Create the city first.');
  }
  return city;
};

const createHospital = async (payload, file) => {
  await assertCityExists(payload.city);

  const existing = await Hospital.findOne({ registrationNumber: payload.registrationNumber });
  if (existing) {
    throw new ApiError(409, 'A hospital with this registration number already exists.');
  }

  const hospitalData = { ...payload };

  // Handle image upload if file provided
  if (file) {
    try {
      const imageResult = await uploadImage(file, 'upcharganaga/hospitals');
      hospitalData.image = {
        url: imageResult.url,
        publicId: imageResult.publicId,
      };
    } catch (err) {
      console.error('❌ [HOSPITAL] Image upload failed:', err.message);
      throw err;
    }
  }

  return Hospital.create(hospitalData);
};

const getHospitals = async (queryString, isAdmin = false) => {
  const query = { ...queryString };
  if (!isAdmin) query.isActive = 'true';

  const features = new ApiFeatures(Hospital.find().populate('city', 'name state'), query)
    .filter(['city', 'type', 'isActive'])
    .search(['name'])
    .sort()
    .paginate();

  const [hospitals, total] = await Promise.all([
    features.query,
    Hospital.countDocuments(features.filterQuery),
  ]);

  return { hospitals, total, pagination: features.pagination };
};

const getHospitalById = async (id, isAdmin = false) => {
  const filter = { _id: id };
  if (!isAdmin) filter.isActive = true;

  const hospital = await Hospital.findOne(filter).populate('city', 'name state');
  if (!hospital) {
    throw new ApiError(404, 'Hospital not found.');
  }
  return hospital;
};

const updateHospital = async (id, payload, file) => {
  const hospital = await Hospital.findById(id);
  if (!hospital) {
    throw new ApiError(404, 'Hospital not found.');
  }

  if (payload.city) {
    await assertCityExists(payload.city);
  }

  if (payload.registrationNumber && payload.registrationNumber !== hospital.registrationNumber) {
    const duplicate = await Hospital.findOne({
      registrationNumber: payload.registrationNumber,
      _id: { $ne: id },
    });
    if (duplicate) {
      throw new ApiError(409, 'A hospital with this registration number already exists.');
    }
  }

  // Handle image replacement if file provided
  if (file) {
    try {
      // Delete old image if it exists
      if (hospital.image?.publicId) {
        await deleteImage(hospital.image.publicId);
      }

      // Upload new image
      const imageResult = await replaceImage(file, hospital.image?.publicId, 'upcharganaga/hospitals');
      payload.image = {
        url: imageResult.url,
        publicId: imageResult.publicId,
      };
    } catch (err) {
      console.error('❌ [HOSPITAL] Image replacement failed:', err.message);
      throw err;
    }
  }

  Object.assign(hospital, payload);
  await hospital.save();
  return hospital;
};

/**
 * Soft-deleting a Hospital cascades to its Departments and Doctors in a
 * single transaction — a hospital going inactive must never leave "orphan"
 * active departments/doctors that are still bookable under it. Nothing is
 * ever hard-deleted, preserving history for existing
 * Appointments/Payments that reference these records.
 * Also deletes the hospital image from Cloudinary if it exists.
 */
const softDeleteHospital = async (id) => {
  const hospital = await Hospital.findById(id);
  if (!hospital) {
    throw new ApiError(404, 'Hospital not found.');
  }

  return withTransaction(async (session) => {
    hospital.isActive = false;
    await hospital.save({ session });

    await Department.updateMany({ hospital: id }, { isActive: false }, { session });
    await Doctor.updateMany({ hospital: id }, { isActive: false }, { session });

    // Delete associated image
    if (hospital.image?.publicId) {
      await deleteImage(hospital.image.publicId);
    }

    return hospital;
  });
};

module.exports = {
  createHospital,
  getHospitals,
  getHospitalById,
  updateHospital,
  softDeleteHospital,
};
