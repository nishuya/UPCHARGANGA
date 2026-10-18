const crypto = require('crypto');
const User = require('../auth/auth.model');
const Doctor = require('./doctors.model');
const Hospital = require('../hospitals/hospitals.model');
const Department = require('../departments/departments.model');
const Queue = require('../queue/queue.model');
const QueueScheduler = require('../queue/queue.scheduler.service');
const ApiError = require('../../errors/ApiError');
const ApiFeatures = require('../../utils/apiFeatures.util');
const withTransaction = require('../../utils/withTransaction.util');
const sendEmail = require('../../utils/email.util');
const config = require('../../config/env');
const { USER_ROLES } = require('../../constants/enums');
const { uploadImage, deleteImage, replaceImage } = require('../../utils/cloudinary.util');

/**
 * Generates a random temporary password for a newly provisioned staff
 * account. The doctor receives this via email and is expected to reset it
 * on first login. (A `mustChangePassword` flag is a natural follow-up
 * addition once the profile/settings module exists.)
 */
const generateTempPassword = () => crypto.randomBytes(9).toString('base64url'); // ~12 chars

const DOCTOR_POPULATE = [
  { path: 'user', select: 'fullName email phone gender dateOfBirth isActive profileImage' },
  { path: 'hospital', select: 'name city address contact.phone' },
  { path: 'department', select: 'name' },
];

/**
 * Creates the doctor's User (auth identity) and Doctor (professional
 * profile) documents together, atomically. If either insert fails, both
 * are rolled back — we never want a User with no matching Doctor profile,
 * or vice versa. Also handles image upload to Cloudinary.
 */
const createDoctor = async (payload, file) => {
  const {
    fullName, email, phone, gender, dateOfBirth,
    hospital, department, specialization, qualifications,
    experienceYears, licenseNumber, consultationFee, availability,
  } = payload;

  // Ensure qualifications is an array
  const finalQualifications = Array.isArray(qualifications)
    ? qualifications.filter(q => q && q.trim())
    : [];

  console.log('📚 [DOCTOR] Qualifications received:', qualifications);
  console.log('📚 [DOCTOR] Qualifications final:', finalQualifications);

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
  if (departmentDoc.hospital.toString() !== hospital) {
    throw new ApiError(400, 'Selected department does not belong to the selected hospital.');
  }

  // AUTO-GENERATE DEFAULT AVAILABILITY if not provided
  // This allows UI to work without requiring availability input
  let finalAvailability = availability || [];
  if (!finalAvailability || finalAvailability.length === 0) {
    console.log('📅 [DOCTOR] No availability provided, generating default schedule (Mon-Fri, 9am-5pm, 30 patients per slot)');
    finalAvailability = [
      { day: 'Monday', startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15, maxPatients: 30 },
      { day: 'Tuesday', startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15, maxPatients: 30 },
      { day: 'Wednesday', startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15, maxPatients: 30 },
      { day: 'Thursday', startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15, maxPatients: 30 },
      { day: 'Friday', startTime: '09:00', endTime: '17:00', slotDurationMinutes: 15, maxPatients: 30 },
    ];
  }

  const tempPassword = generateTempPassword();

  // Handle image upload if file provided
  let imageData = null;
  if (file) {
    try {
      const imageResult = await uploadImage(file, 'upcharganaga/doctors');
      imageData = {
        url: imageResult.url,
        publicId: imageResult.publicId,
      };
    } catch (err) {
      console.error('❌ [DOCTOR] Image upload failed:', err.message);
      throw err;
    }
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
          password: tempPassword, // hashed by the User pre-save hook
          role: USER_ROLES.DOCTOR,
          hospital,
          isSetupComplete: false, // Account not yet activated
        },
      ],
      { session }
    );

    // Generate secure one-time setup token
    const token = user.createAccountSetupToken();
    await user.save({ session });

    const doctorPayload = {
      user: user._id,
      hospital,
      department,
      specialization,
      qualifications: finalQualifications, // Use cleaned-up qualifications array
      experienceYears,
      licenseNumber,
      consultationFee,
      availability: finalAvailability, // Use auto-generated or provided availability
    };

    if (imageData) {
      doctorPayload.image = imageData;
    }

    const [doctor] = await Doctor.create([doctorPayload], { session });

    return { doctorId: doctor._id, setupToken: token };
  });

  // Email delivery happens AFTER the transaction commits. A failed email
  // should never roll back an otherwise-valid account — we log and let the
  // admin resend/share setup link manually instead.
  try {
    const setupUrl = `${config.clientUrl}/setup`;
    await sendEmail({
      to: email,
      subject: 'Complete Your Doctor Account Setup',
      html: `
        <p>Hello Dr. ${fullName},</p>
        <p>An account has been created for you on HealQ.</p>
        <p>Please complete your account setup and set your password by clicking the link below:</p>
        <p><a href="${setupUrl}?token=${setupToken}">Complete Account Setup</a></p>
        <p>This link will expire in 10 minutes. If you did not request this account, please contact your administrator.</p>
        <p>Do not share this link with anyone.</p>
      `,
    });
  } catch (err) {
    console.error('[doctors.service] Failed to send doctor welcome email:', err.message);
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

  // Ensure qualifications is an array
  if (payload.qualifications) {
    const qualifications = payload.qualifications;
    payload.qualifications = Array.isArray(qualifications)
      ? qualifications.filter(q => q && q.trim())
      : [];
    console.log('📚 [DOCTOR UPDATE] Qualifications final:', payload.qualifications);
  }

  // Handle image replacement if file provided
  if (file) {
    try {
      // Delete old image if it exists
      if (doctor.image?.publicId) {
        await deleteImage(doctor.image.publicId);
      }

      // Upload new image
      const imageResult = await replaceImage(file, doctor.image?.publicId, 'upcharganaga/doctors');
      payload.image = {
        url: imageResult.url,
        publicId: imageResult.publicId,
      };
    } catch (err) {
      console.error('❌ [DOCTOR] Image replacement failed:', err.message);
      throw err;
    }
  }

  const updatedDoctor = await Doctor.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  }).populate(DOCTOR_POPULATE);

  if (payload.availability) {
    const queues = await Queue.find({ doctor: id });
    await Promise.all(
      queues.map((queue) => QueueScheduler.recalculateQueue(id, queue.date))
    );
  }

  return updatedDoctor;
};

/**
 * Reassigns a doctor to a different hospital. The doctor's User.hospital
 * field is kept in sync in the same transaction — those two fields MUST
 * never drift apart, since auth/RBAC and staff-listing queries rely on
 * User.hospital being correct.
 *
 * CRITICAL: Both Doctor.hospital and User.hospital are updated atomically.
 * If either fails, the entire transaction rolls back.
 *
 * NOTE: reassigning hospital does NOT auto-reassign department (a
 * department is hospital-specific) — callers must follow up with
 * assign-department, which is enforced by the department-reassignment
 * check below.
 */
const assignHospital = async (id, hospitalId) => {
  console.log('🏥 [DOCTOR] Reassigning doctor:', id, 'to hospital:', hospitalId);

  const doctor = await Doctor.findById(id);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  const hospital = await Hospital.findOne({ _id: hospitalId, isActive: true });
  if (!hospital) throw new ApiError(404, 'Hospital not found or inactive.');

  return withTransaction(async (session) => {
    // Step 1: Update Doctor.hospital
    doctor.hospital = hospitalId;
    await doctor.save({ session });
    console.log('💾 [DOCTOR] Doctor.hospital updated to:', hospitalId);

    // Step 2: Update User.hospital in same transaction
    const userUpdateResult = await User.findByIdAndUpdate(
      doctor.user,
      { hospital: hospitalId },
      { session, new: true }
    );

    if (!userUpdateResult) {
      console.error('❌ [DOCTOR] User.hospital update failed - User not found:', doctor.user);
      throw new ApiError(500, 'Failed to sync doctor user hospital assignment.');
    }

    console.log('💾 [DOCTOR] User.hospital updated to:', hospitalId);

    // Step 3: Verify sync after transaction
    const verifyUser = await User.findById(doctor.user).session(session);
    const verifyDoctor = await Doctor.findById(id).session(session);

    if (verifyUser.hospital.toString() !== verifyDoctor.hospital.toString()) {
      console.error('⚠️  [DOCTOR] SYNC DRIFT DETECTED after update!', {
        docHospital: verifyDoctor.hospital,
        userHospital: verifyUser.hospital,
      });
      throw new ApiError(500, 'Hospital assignment sync failed - please retry.');
    }

    console.log('✅ [DOCTOR] Hospital reassignment complete and verified');
    return Doctor.findById(id).populate(DOCTOR_POPULATE).session(session);
  });
};

/**
 * Reassigns a doctor to a different department. Enforces that the target
 * department actually belongs to the doctor's CURRENT hospital — silently
 * allowing a cross-hospital department assignment would produce
 * inconsistent hospital/department pairs throughout appointments/queues.
 */
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

/**
 * Soft-deletes a doctor AND deactivates their underlying User account in
 * the same transaction — a deactivated doctor must not still be able to
 * log in. Also deletes the doctor's image from Cloudinary if it exists.
 */
const softDeleteDoctor = async (id) => {
  const doctor = await Doctor.findById(id);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  // Delete associated image
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

/**
 * Creates an unavailability period for a doctor.
 * This marks the doctor as unavailable from startDate to endDate.
 * The scheduler will automatically cancel any appointments in this period.
 *
 * @param {ObjectId} doctorId - Doctor ID
 * @param {Object} payload - { startDate, endDate, reason, notes }
 * @param {ObjectId} createdBy - User ID of admin who created this
 * @returns {Promise<Doctor>}
 */
const createUnavailability = async (doctorId, payload, createdBy) => {
  console.log('🏥 [UNAVAIL] Creating unavailability for doctor:', doctorId, payload);

  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  const { startDate, endDate, reason, notes } = payload;

  // Validate dates
  if (new Date(startDate) >= new Date(endDate)) {
    throw new ApiError(400, 'Start date must be before end date.');
  }

  if (new Date(startDate) < new Date()) {
    throw new ApiError(400, 'Cannot create unavailability for past dates.');
  }

  // Add the unavailability entry
  doctor.unavailability.push({
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    reason,
    notes,
    createdBy,
    createdAt: new Date(),
  });

  await doctor.save();
  console.log('✅ [UNAVAIL] Unavailability period created for doctor:', doctorId);

  // Emit Socket.IO event so all connected clients see the update in real-time
  const socketEmitter = require('../../sockets/socketEmitter');
  socketEmitter.emitToHospital(doctor.hospital, 'doctorUnavailabilityCreated', {
    doctorId: doctor._id,
    doctorName: doctor.fullName,
    startDate,
    endDate,
    reason,
  });

  return Doctor.findById(doctorId).populate(DOCTOR_POPULATE);
};

/**
 * Retrieves all unavailability periods for a doctor.
 *
 * @param {ObjectId} doctorId - Doctor ID
 * @returns {Promise<Array>}
 */
const getUnavailability = async (doctorId) => {
  console.log('🏥 [UNAVAIL] Fetching unavailability periods for doctor:', doctorId);

  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  return doctor.unavailability || [];
};

/**
 * Updates an existing unavailability period.
 *
 * @param {ObjectId} doctorId - Doctor ID
 * @param {ObjectId} unavailabilityId - Unavailability period ID (subdoc _id)
 * @param {Object} payload - { startDate?, endDate?, reason?, notes? }
 * @returns {Promise<Doctor>}
 */
const updateUnavailability = async (doctorId, unavailabilityId, payload) => {
  console.log('🏥 [UNAVAIL] Updating unavailability for doctor:', doctorId, unavailabilityId);

  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  const unavailPeriod = doctor.unavailability.id(unavailabilityId);
  if (!unavailPeriod) throw new ApiError(404, 'Unavailability period not found.');

  // Validate new dates if provided
  const newStartDate = payload.startDate ? new Date(payload.startDate) : unavailPeriod.startDate;
  const newEndDate = payload.endDate ? new Date(payload.endDate) : unavailPeriod.endDate;

  if (newStartDate >= newEndDate) {
    throw new ApiError(400, 'Start date must be before end date.');
  }

  // Update fields
  if (payload.startDate) unavailPeriod.startDate = newStartDate;
  if (payload.endDate) unavailPeriod.endDate = newEndDate;
  if (payload.reason) unavailPeriod.reason = payload.reason;
  if (payload.notes !== undefined) unavailPeriod.notes = payload.notes;

  await doctor.save();
  console.log('✅ [UNAVAIL] Unavailability period updated for doctor:', doctorId);

  // Emit Socket.IO event
  const socketEmitter = require('../../sockets/socketEmitter');
  socketEmitter.emitToHospital(doctor.hospital, 'doctorUnavailabilityUpdated', {
    doctorId: doctor._id,
    doctorName: doctor.fullName,
    unavailabilityId,
    startDate: newStartDate,
    endDate: newEndDate,
  });

  return Doctor.findById(doctorId).populate(DOCTOR_POPULATE);
};

/**
 * Deletes an unavailability period.
 *
 * @param {ObjectId} doctorId - Doctor ID
 * @param {ObjectId} unavailabilityId - Unavailability period ID (subdoc _id)
 * @returns {Promise<Doctor>}
 */
const deleteUnavailability = async (doctorId, unavailabilityId) => {
  console.log('🏥 [UNAVAIL] Deleting unavailability for doctor:', doctorId, unavailabilityId);

  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new ApiError(404, 'Doctor not found.');

  const unavailPeriod = doctor.unavailability.id(unavailabilityId);
  if (!unavailPeriod) throw new ApiError(404, 'Unavailability period not found.');

  doctor.unavailability.id(unavailabilityId).deleteOne();
  await doctor.save();
  console.log('✅ [UNAVAIL] Unavailability period deleted for doctor:', doctorId);

  // Emit Socket.IO event
  const socketEmitter = require('../../sockets/socketEmitter');
  socketEmitter.emitToHospital(doctor.hospital, 'doctorUnavailabilityDeleted', {
    doctorId: doctor._id,
    doctorName: doctor.fullName,
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
