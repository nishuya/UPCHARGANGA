const crypto = require('crypto');
const User = require('../auth/auth.model');
const Doctor = require('./doctors.model');
const Hospital = require('../hospitals/hospitals.model');
const Department = require('../departments/departments.model');
const QueueScheduler = require('../queue/queue.scheduler.service');
const { cascadeDoctorUnavailability } = require('../doctorAssistant/doctorAssistant.service');
const ApiError = require('../../errors/ApiError');
const ApiFeatures = require('../../utils/apiFeatures.util');
const withTransaction = require('../../utils/withTransaction.util');
const sendEmail = require('../../utils/email.util');
const config = require('../../config/env');
const { USER_ROLES } = require('../../constants/enums');
const { normalizeDateOnly, getHospitalNow } = require('../../utils/datetime.util');
const { uploadImage, deleteImage, replaceImage } = require('../../utils/cloudinary.util');

const generateTempPassword = () => crypto.randomBytes(9).toString('base64url');

const DOCTOR_POPULATE = [
  { path: 'user', select: 'fullName email phone gender dateOfBirth isActive profileImage' },
  { path: 'hospital', select: 'name city address contact.phone' },
  { path: 'department', select: 'name' },
];

const createDoctor = async (payload, file) => {
  const {
    fullName,
    email,
    phone,
    gender,
    dateOfBirth,
    hospital,
    department,
    specialization,
    qualifications,
    experienceYears,
    licenseNumber,
    consultationFee,
    availability,
  } = payload;

  const finalQualifications = Array.isArray(qualifications)
    ? qualifications.filter((q) => q && q.trim())
    : [];

  const [existingUser, existingLicense, hospitalDoc, departmentDoc] = await Promise.all([
    User.findOne({ $or: [{ email }, { phone }] }),
    Doctor.findOne({ licenseNumber }),
    Hospital.findOne({ _id: hospital, isActive: true }),
    Department.findOne({ _id: department, isActive: true }),
  ]);

  if (existingUser) {
    throw new ApiError(409, 'A user with this email or phone already exists.');
  }
  if (existingLicense) {
    throw new ApiError(409, 'A doctor with this license number already exists.');
  }
  if (!hospitalDoc) {
    throw new ApiError(404, 'Hospital not found or inactive.');
  }
  if (!departmentDoc) {
    throw new ApiError(404, 'Department not found or inactive.');
  }
  if (departmentDoc.hospital.toString() !== hospital.toString()) {
    throw new ApiError(400, 'Selected department does not belong to the selected hospital.');
  }

  let finalAvailability = availability || [];
  if (!finalAvailability || finalAvailability.length === 0) {
    finalAvailability = [
      { day: 'monday', startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15, maxPatients: 30 },
      { day: 'tuesday', startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15, maxPatients: 30 },
      { day: 'wednesday', startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15, maxPatients: 30 },
      { day: 'thursday', startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15, maxPatients: 30 },
      { day: 'friday', startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15, maxPatients: 30 },
    ];
  } else {
    finalAvailability = finalAvailability.map((slot) => ({
      ...slot,
      day: String(slot.day || '').toLowerCase(),
    }));
  }

  const tempPassword = generateTempPassword();

  let imageData = null;
  if (file) {
    const imageResult = await uploadImage(file, 'upcharganaga/doctors');
    imageData = {
      url: imageResult.url,
      publicId: imageResult.publicId,
    };
  }

  const { doctorId, setupToken } = await withTransaction(async (session) => {
    const [user] = await User.create(
      [
        {
          fullName,
          email,
          phone,
          gender,
          dateOfBirth,
          password: tempPassword,
          role: USER_ROLES.DOCTOR,
          hospital,
          isSetupComplete: false,
        },
      ],
      { session }
    );

    const token = user.createAccountSetupToken();
    await user.save({ session });

    const doctorPayload = {
      user: user._id,
      hospital,
      department,
      specialization,
      qualifications: finalQualifications,
      experienceYears,
      licenseNumber,
      consultationFee,
      availability: finalAvailability,
    };

    if (imageData) {
      doctorPayload.image = imageData;
    }

    const [doctor] = await Doctor.create([doctorPayload], { session });

    return { doctorId: doctor._id, setupToken: token };
  });

  try {
    const setupUrl = `${config.clientUrl}/setup`;
    await sendEmail({
      to: email,
      subject: 'Complete Your Doctor Account Setup',
      html: `
        <p>Hello Dr. ${fullName},</p>
        <p>An account has been created for you on UpcharGanga.</p>
        <p>Please complete your account setup and set your password by clicking the link below:</p>
        <p><a href="${setupUrl}?token=${setupToken}">Complete Account Setup</a></p>
      `,
    });
  } catch (_err) {
    // Do not fail account creation if email transport is not configured
  }

  return Doctor.findById(doctorId).populate(DOCTOR_POPULATE);
};

const getDoctors = async (queryString, isAdmin = false) => {
  const query = { ...queryString };
  if (!isAdmin) query.isActive = 'true';

  const features = new ApiFeatures(Doctor.find().populate(DOCTOR_POPULATE), query)
    .filter(['hospital', 'department', 'isActive'])
    .search(['specialization'])
    .sort()
    .paginate();

  const [doctors, total] = await Promise.all([
    features.query,
    Doctor.countDocuments(features.filterQuery),
  ]);

  return { doctors, total, pagination: features.pagination };
};

const getDoctorById = async (id, isAdmin = false) => {
  const filter = { _id: id };
  if (!isAdmin) filter.isActive = true;

  const doctor = await Doctor.findOne(filter).populate(DOCTOR_POPULATE);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');
  return doctor;
};

const updateDoctor = async (id, payload, file) => {
  const doctor = await Doctor.findById(id);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  if (payload.qualifications) {
    const qualifications = payload.qualifications;
    payload.qualifications = Array.isArray(qualifications)
      ? qualifications.filter((q) => q && q.trim())
      : [];
  }

  if (Array.isArray(payload.availability)) {
    payload.availability = payload.availability.map((slot) => ({
      ...slot,
      day: String(slot.day || '').toLowerCase(),
    }));
  }

  if (file) {
    if (doctor.image?.publicId) {
      await deleteImage(doctor.image.publicId);
    }
    const imageResult = await replaceImage(file, doctor.image?.publicId, 'upcharganaga/doctors');
    payload.image = {
      url: imageResult.url,
      publicId: imageResult.publicId,
    };
  }

  const updatedDoctor = await Doctor.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  }).populate(DOCTOR_POPULATE);

  // If availability or isAvailableToday changed, recalculate today's queue or cascade cancel
  const today = normalizeDateOnly(getHospitalNow());
  if (payload.isAvailableToday === false || payload.isAvailableToday === 'false') {
    await cascadeDoctorUnavailability(updatedDoctor, today, today, 'Doctor unavailable today');
  } else if (payload.availability) {
    const Queue = require('../queue/queue.model');
    const { broadcastQueueRecalculation } = require('../../sockets/socketEmitter');
    const activeQueues = await Queue.find({ doctor: id, date: { $gte: today } });
    for (const q of activeQueues) {
      const recalculated = await QueueScheduler.recalculateQueue(id, q.date);
      if (recalculated) {
        broadcastQueueRecalculation({ doctorId: id, date: q.date, queue: recalculated });
      }
    }
  }

  return updatedDoctor;
};

const assignHospital = async (id, hospitalId) => {
  const doctor = await Doctor.findById(id);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  const hospital = await Hospital.findOne({ _id: hospitalId, isActive: true });
  if (!hospital) throw new ApiError(404, 'Hospital not found or inactive.');

  return withTransaction(async (session) => {
    doctor.hospital = hospitalId;
    await doctor.save({ session });

    const userUpdateResult = await User.findByIdAndUpdate(
      doctor.user,
      { hospital: hospitalId },
      { session, new: true }
    );

    if (!userUpdateResult) {
      throw new ApiError(500, 'Failed to sync doctor user hospital assignment.');
    }

    return Doctor.findById(id).populate(DOCTOR_POPULATE).session(session);
  });
};

const assignDepartment = async (id, departmentId) => {
  const doctor = await Doctor.findById(id);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  const department = await Department.findOne({ _id: departmentId, isActive: true });
  if (!department) throw new ApiError(404, 'Department not found or inactive.');

  if (department.hospital.toString() !== doctor.hospital.toString()) {
    throw new ApiError(
      400,
      "Cannot assign a department that does not belong to the doctor's current hospital. Reassign the hospital first."
    );
  }

  doctor.department = departmentId;
  await doctor.save();
  return Doctor.findById(id).populate(DOCTOR_POPULATE);
};

const softDeleteDoctor = async (id) => {
  const doctor = await Doctor.findById(id);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  if (doctor.image?.publicId) {
    await deleteImage(doctor.image.publicId);
  }

  return withTransaction(async (session) => {
    doctor.isActive = false;
    doctor.isAvailableToday = false;
    await doctor.save({ session });
    await User.findByIdAndUpdate(doctor.user, { isActive: false }, { session });
    return doctor;
  });
};

const createUnavailability = async (doctorId, payload, createdBy) => {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  const { startDate, endDate, reason, notes } = payload;
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    throw new ApiError(400, 'Start date must be before or equal to end date.');
  }

  if (normalizeDateOnly(start) < normalizeDateOnly(getHospitalNow())) {
    throw new ApiError(400, 'Cannot create unavailability for past dates.');
  }

  doctor.unavailability.push({
    startDate: start,
    endDate: end,
    reason,
    notes,
    createdBy,
    createdAt: getHospitalNow(),
  });

  await doctor.save();

  // Immediately cancel affected appointments in this range and broadcast queue updates
  await cascadeDoctorUnavailability(doctor, start, end, reason);

  return Doctor.findById(doctorId).populate(DOCTOR_POPULATE);
};

const getUnavailability = async (doctorId) => {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  return doctor.unavailability || [];
};

const updateUnavailability = async (doctorId, unavailabilityId, payload) => {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  const unavailPeriod = doctor.unavailability.id(unavailabilityId);
  if (!unavailPeriod) throw new ApiError(404, 'Unavailability period not found.');

  const newStartDate = payload.startDate ? new Date(payload.startDate) : unavailPeriod.startDate;
  const newEndDate = payload.endDate ? new Date(payload.endDate) : unavailPeriod.endDate;

  if (newStartDate > newEndDate) {
    throw new ApiError(400, 'Start date must be before or equal to end date.');
  }

  if (payload.startDate) unavailPeriod.startDate = newStartDate;
  if (payload.endDate) unavailPeriod.endDate = newEndDate;
  if (payload.reason) unavailPeriod.reason = payload.reason;
  if (payload.notes !== undefined) unavailPeriod.notes = payload.notes;

  await doctor.save();
  await cascadeDoctorUnavailability(doctor, newStartDate, newEndDate, unavailPeriod.reason);

  return Doctor.findById(doctorId).populate(DOCTOR_POPULATE);
};

const deleteUnavailability = async (doctorId, unavailabilityId) => {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  const unavailPeriod = doctor.unavailability.id(unavailabilityId);
  if (!unavailPeriod) throw new ApiError(404, 'Unavailability period not found.');

  doctor.unavailability.id(unavailabilityId).deleteOne();
  await doctor.save();

  const socketEmitter = require('../../sockets/socketEmitter');
  socketEmitter.emitToHospital(doctor.hospital, 'doctor:unavailability-deleted', {
    doctorId: doctor._id,
    unavailabilityId,
  });

  return Doctor.findById(doctorId).populate(DOCTOR_POPULATE);
};

module.exports = {
  createDoctor,
  getDoctors,
  getDoctorById,
  updateDoctor,
  assignHospital,
  assignDepartment,
  softDeleteDoctor,
  createUnavailability,
  getUnavailability,
  updateUnavailability,
  deleteUnavailability,
};
