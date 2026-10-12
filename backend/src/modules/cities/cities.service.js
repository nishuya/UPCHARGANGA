const City = require('./cities.model');
const ApiError = require('../../errors/ApiError');
const ApiFeatures = require('../../utils/apiFeatures.util');
const { uploadImage, deleteImage, replaceImage } = require('../../utils/cloudinary.util');

const createCity = async (payload, file) => {
  const existing = await City.findOne({ name: payload.name, state: payload.state });
  if (existing) {
    throw new ApiError(409, `${payload.name}, ${payload.state} already exists.`);
  }

  const cityData = { ...payload };

  // Handle image upload if file provided
  if (file) {
    try {
      const imageResult = await uploadImage(file, 'upcharganaga/cities');
      cityData.image = {
        url: imageResult.url,
        publicId: imageResult.publicId,
      };
    } catch (err) {
      console.error('❌ [CITY] Image upload failed:', err.message);
      throw err;
    }
  }

  return City.create(cityData);
};

/**
 * isAdmin controls whether inactive (soft-deleted) cities are visible —
 * public browse endpoints must never leak them, but the admin dashboard
 * needs to see them in order to reactivate a city later.
 */
const getCities = async (queryString, isAdmin = false) => {
  const query = { ...queryString };
  if (!isAdmin) query.isActive = 'true';

  const features = new ApiFeatures(City.find(), query)
    .filter(['isActive', 'state', 'country'])
    .search(['name', 'state'])
    .sort()
    .paginate();

  const [cities, total] = await Promise.all([
    features.query,
    City.countDocuments(features.filterQuery),
  ]);

  return { cities, total, pagination: features.pagination };
};

const getCityById = async (id, isAdmin = false) => {
  const filter = { _id: id };
  if (!isAdmin) filter.isActive = true;

  const city = await City.findOne(filter);
  if (!city) {
    throw new ApiError(404, 'City not found.');
  }
  return city;
};

const updateCity = async (id, payload, file) => {
  const city = await City.findById(id);
  if (!city) {
    throw new ApiError(404, 'City not found.');
  }

  if (payload.name || payload.state) {
    const name = payload.name || city.name;
    const state = payload.state || city.state;
    const duplicate = await City.findOne({ name, state, _id: { $ne: id } });
    if (duplicate) {
      throw new ApiError(409, `${name}, ${state} already exists.`);
    }
  }

  // Handle image replacement if file provided
  if (file) {
    try {
      // Delete old image if it exists
      if (city.image?.publicId) {
        await deleteImage(city.image.publicId);
      }

      // Upload new image
      const imageResult = await replaceImage(file, city.image?.publicId, 'upcharganaga/cities');
      payload.image = {
        url: imageResult.url,
        publicId: imageResult.publicId,
      };
    } catch (err) {
      console.error('❌ [CITY] Image replacement failed:', err.message);
      throw err;
    }
  }

  Object.assign(city, payload);
  await city.save();
  return city;
};

/**
 * Soft delete only — City is a lightweight lookup entity with no
 * dependents to cascade, but is still never hard-deleted so historical
 * references (e.g. Hospital.address.city) never dangle.
 * Also deletes the city image from Cloudinary if it exists.
 */
const softDeleteCity = async (id) => {
  const city = await City.findById(id);
  if (!city) {
    throw new ApiError(404, 'City not found.');
  }

  // Delete associated image
  if (city.image?.publicId) {
    await deleteImage(city.image.publicId);
  }

  city.isActive = false;
  await city.save();
  return city;
};

module.exports = { createCity, getCities, getCityById, updateCity, softDeleteCity };
