const mongoose = require('mongoose');
const { Schema } = mongoose;
const { APPOINTMENT_STATUS, CONSULTATION_TYPE } = require('../../constants/enums');

const appointmentSchema = new Schema(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Patient is required'],
      index: true,
    },

    doctor: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'Doctor is required'],
      index: true,
    },

    hospital: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true,
      index: true,
    },

    department: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },

    appointmentDate: {
      type: Date,
      required: [true, 'Appointment date is required'],
      index: true,
    },

    timeSlot: {
      start: { type: String, required: true }, // "HH:mm"
      end: { type: String, required: true },   // "HH:mm"
    },

    tokenNumber: {
      type: Number,
      required: true,
    },

    bookingNumber: {
      type: String,
      required: true,
      unique: true,
    },

    status: {
      type: String,
      enum: Object.values(APPOINTMENT_STATUS),
      default: APPOINTMENT_STATUS.PENDING,
      index: true,
    },

    consultationType: {
      type: String,
      enum: Object.values(CONSULTATION_TYPE),
      default: CONSULTATION_TYPE.ONLINE_BOOKING,
    },

    reasonForVisit: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    symptoms: {
      type: [String],
      default: [],
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    payment: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },

    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    cancellationReason: {
      type: String,
      trim: true,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    cutoffTime: {
      type: Date,
      default: null,
      index: true,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    verificationNotes: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },

    arrivedAt: {
      type: Date,
      default: null,
    },

    isInDoctorQueue: {
      type: Boolean,
      default: false,
    },

    consultationNotes: {
      type: String,
      trim: true,
      default: null,
    },

    // --- ATTENDANCE TRACKING (Reception Panel) ---
    attendanceMarkedAt: {
      type: Date,
      default: null,
    },
    attendanceMarkedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    attendanceWindowClosesAt: {
      type: Date,
      default: null,
    },

    attendanceTimeoutApplied: {
      type: Boolean,
      default: false,
    },

    attendanceTimeoutAppliedAt: {
      type: Date,
      default: null,
    },

    // --- ACTUAL CONSULTATION PROGRESS ---
    actualConsultationStartedAt: {
      type: Date,
      default: null,
    },

    actualConsultationCompletedAt: {
      type: Date,
      default: null,
    },

    actualConsultationDurationMinutes: {
      type: Number,
      default: null,
    },

    // --- AUTHORITATIVE ESTIMATED CONSULTATION TIME & TIMING STATUS ---
    initialEstimatedStartTime: {
      type: Date,
      default: null,
    },
    initialEstimatedEndTime: {
      type: Date,
      default: null,
    },
    estimatedConsultationStartTime: {
      type: Date,
      default: null,
    },
    estimatedConsultationEndTime: {
      type: Date,
      default: null,
    },
    recommendedArrivalTime: {
      type: Date,
      default: null,
    },
    queuePosition: {
      type: Number,
      default: null,
    },
    queueEntryStatus: {
      type: String,
      default: 'waiting',
    },
    arrivalStatus: {
      type: String,
      default: 'not-arrived',
    },
    timingStatus: {
      type: String,
      default: 'on-time',
    },
    delayMinutes: {
      type: Number,
      default: 0,
    },
    aheadMinutes: {
      type: Number,
      default: 0,
    },
    statusLabel: {
      type: String,
      default: 'On Time',
    },
    statusMessage: {
      type: String,
      default: null,
    },
    recommendedAction: {
      type: String,
      default: null,
    },
    consultationDurationMinutes: {
      type: Number,
      default: 15,
    },
    queueVersion: {
      type: Number,
      default: 1,
    },

    // --- QUEUE STATE SNAPSHOT ---
    lastQueuePositionSnapshot: {
      position: { type: Number, default: null },
      estimatedReportingTime: { type: Date, default: null },
      estimatedWaitingMinutes: { type: Number, default: null },
      snapshotAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

appointmentSchema.index(
  { doctor: 1, appointmentDate: 1, tokenNumber: 1 },
  { unique: true }
);

appointmentSchema.index({ patient: 1, appointmentDate: -1 });
appointmentSchema.index({ hospital: 1, appointmentDate: 1, status: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
