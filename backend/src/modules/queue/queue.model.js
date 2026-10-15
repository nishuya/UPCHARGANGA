const mongoose = require('mongoose');
const { Schema } = mongoose;
const { QUEUE_ENTRY_STATUS, QUEUE_STATUS } = require('../../constants/enums');

const TIMING_STATUS_VALUES = [
  'on-time',
  'late-patient',
  'delayed-queue',
  'ahead-of-schedule',
  'in-consultation',
  'called',
  'pending-skip',
  'completed',
  'cancelled',
  'no-show',
  'doctor-unavailable',
];

const queueEntrySchema = new Schema(
  {
    appointment: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
    },

    patient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    tokenNumber: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(QUEUE_ENTRY_STATUS),
      default: QUEUE_ENTRY_STATUS.WAITING,
    },

    // --- SCHEDULED (initial booking baseline) ---
    scheduledStartTime: {
      type: String,
      default: null,
    },
    scheduledEndTime: {
      type: String,
      default: null,
    },
    initialEstimatedStartTime: {
      type: Date,
      default: null,
    },
    initialEstimatedEndTime: {
      type: Date,
      default: null,
    },

    // --- ESTIMATED CONSULTATION TIME (authoritative current estimate) ---
    estimatedConsultationStartTime: {
      type: Date,
      default: null,
    },
    estimatedConsultationEndTime: {
      type: Date,
      default: null,
    },

    // Active position among waiting patients (1 = next waiting patient; 0 = in consultation; null = inactive/skipped/completed)
    queuePosition: {
      type: Number,
      default: null,
    },

    // Sequence order when a pending/skipped patient rejoins
    reinsertOrder: {
      type: Number,
      default: null,
    },
    rejoinedAt: {
      type: Date,
      default: null,
    },

    // Recommended early reporting time (e.g., 10 min before estimated start)
    recommendedArrivalTime: {
      type: Date,
      default: null,
    },

    // Legacy compatibility fields
    estimatedReportingTime: {
      type: Date,
      default: null,
    },
    estimatedWaitingMinutes: {
      type: Number,
      default: null,
    },
    estimatedStartTime: {
      type: String,
      default: null,
    },
    estimatedEndTime: {
      type: String,
      default: null,
    },

    // --- TIMING CLASSIFICATION (ON TIME / LATE PATIENT / DELAYED QUEUE / AHEAD OF SCHEDULE) ---
    timingStatus: {
      type: String,
      enum: TIMING_STATUS_VALUES,
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
    lastUpdatedAt: {
      type: Date,
      default: null,
    },

    // --- ATTENDANCE TRACKING ---
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
    arrivalStatus: {
      type: String,
      enum: ['not-arrived', 'arrived-on-time', 'arrived-late'],
      default: 'not-arrived',
    },

    // --- ACTUAL CONSULTATION PROGRESS ---
    actualStartTime: {
      type: String,
      default: null,
    },
    actualStartDateTime: {
      type: Date,
      default: null,
    },
    actualEndTime: {
      type: String,
      default: null,
    },
    actualEndDateTime: {
      type: Date,
      default: null,
    },
    actualDurationMinutes: {
      type: Number,
      default: null,
    },

    // --- DELAY/ADJUSTMENT TRACKING ---
    delayMinutesFromScheduled: {
      type: Number,
      default: 0,
    },
    delayReason: {
      type: String,
      default: null,
    },

    // Lifecycle timestamps
    checkedInAt: { type: Date, default: null },
    calledAt: { type: Date, default: null },
    consultationStartedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // --- PENDING STATUS TRACKING ---
    pendingMarkedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true, timestamps: false }
);

const queueSchema = new Schema(
  {
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

    doctor: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
    },

    currentTokenNumber: {
      type: Number,
      default: 0,
    },

    totalTokensIssued: {
      type: Number,
      default: 0,
    },

    entries: {
      type: [queueEntrySchema],
      default: [],
    },

    status: {
      type: String,
      enum: Object.values(QUEUE_STATUS),
      default: QUEUE_STATUS.ACTIVE,
    },

    // Configured consultation duration in minutes for this doctor/session
    averageConsultationMinutes: {
      type: Number,
      default: 15,
    },

    // Explicit override set via setAverageConsultationMinutes
    configuredConsultationMinutes: {
      type: Number,
      default: null,
    },

    // Monotonically increasing version number for preventing stale UI overwrites
    queueVersion: {
      type: Number,
      default: 1,
    },

    lastRecalculatedAt: {
      type: Date,
      default: null,
    },

    timingSummary: {
      timingStatus: { type: String, default: 'on-time' },
      queueDelayMinutes: { type: Number, default: 0 },
      queueAheadMinutes: { type: Number, default: 0 },
      statusLabel: { type: String, default: 'On Time' },
      updatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

queueSchema.index({ doctor: 1, date: 1 }, { unique: true });
queueSchema.index({ hospital: 1, date: 1, status: 1 });

module.exports = mongoose.model('Queue', queueSchema);
