const cron = require('node-cron');
const Appointment = require('../modules/appointments/appointments.model');
const Doctor = require('../modules/doctors/doctors.model');
const Queue = require('../modules/queue/queue.model');
const QueueScheduler = require('../modules/queue/queue.scheduler.service');
const notificationService = require('../modules/notifications/notifications.service');
const { getHospitalNow, normalizeDateOnly } = require('../utils/datetime.util');
const { APPOINTMENT_STATUS, QUEUE_ENTRY_STATUS } = require('../constants/enums');
const { broadcastQueueRecalculation } = require('../sockets/socketEmitter');
const socketEmitter = require('../sockets/socketEmitter');

const checkAttendanceTimeoutsJob = () => {
  cron.schedule('*/1 * * * *', async () => {
    try {
      const now = getHospitalNow();
      const today = normalizeDateOnly(now);

      const todaysQueues = await Queue.find({
        date: today,
        status: 'active',
      });

      for (const queue of todaysQueues) {
        try {
          let hasTimeoutToApply = false;

          for (const entry of queue.entries) {
            if (entry.status !== 'waiting' || entry.arrivalStatus !== 'not-arrived') continue;
            if (entry.attendanceTimeoutApplied || !entry.attendanceWindowClosesAt) continue;

            if (now >= entry.attendanceWindowClosesAt) {
              hasTimeoutToApply = true;
            }
          }

          if (hasTimeoutToApply) {
            const recalculatedQueue = await QueueScheduler.recalculateQueue(
              queue.doctor,
              queue.date
            );

            if (recalculatedQueue) {
              broadcastQueueRecalculation({
                doctorId: queue.doctor,
                date: queue.date,
                queue: recalculatedQueue,
              });
            }
          }
        } catch (_err) {
          // Continue processing other queues
        }
      }
    } catch (_err) {
      // Prevent cron crash
    }
  });
};

const expireAppointmentsJob = () => {
  cron.schedule('*/1 * * * *', async () => {
    try {
      const now = getHospitalNow();

      const expiredAppointments = await Appointment.find({
        status: APPOINTMENT_STATUS.CONFIRMED,
        cutoffTime: { $lt: now },
        isActive: true,
      }).populate('patient', 'fullName');

      for (const apt of expiredAppointments) {
        try {
          apt.status = APPOINTMENT_STATUS.EXPIRED;
          apt.isInDoctorQueue = false;
          apt.queuePosition = null;
          await apt.save();

          await Queue.updateOne(
            { doctor: apt.doctor, date: apt.appointmentDate },
            {
              $set: {
                'entries.$[elem].status': QUEUE_ENTRY_STATUS.NO_SHOW,
                'entries.$[elem].queuePosition': null,
              },
            },
            { arrayFilters: [{ 'elem.appointment': apt._id }] }
          );

          const recalculated = await QueueScheduler.recalculateQueue(
            apt.doctor,
            apt.appointmentDate
          );
          if (recalculated) {
            broadcastQueueRecalculation({
              doctorId: apt.doctor,
              date: apt.appointmentDate,
              queue: recalculated,
            });
          }

          if (apt.patient) {
            const appointmentDate = apt.appointmentDate.toISOString().split('T')[0];
            await notificationService.notifyAppointmentExpired(apt.patient._id, {
              appointmentId: apt._id,
              appointmentDate,
            });
          }

          socketEmitter.emitToHospital(apt.hospital, 'appointmentExpired', {
            appointmentId: apt._id,
            status: APPOINTMENT_STATUS.EXPIRED,
            patientId: apt.patient?._id,
          });
        } catch (_err) {
          // Continue
        }
      }
    } catch (_err) {
      // Prevent cron crash
    }
  });
};

const cascadeCancelAppointmentsJob = () => {
  cron.schedule('*/2 * * * *', async () => {
    try {
      const doctorsWithUnavailability = await Doctor.find({
        'unavailability.0': { $exists: true },
        isActive: true,
      }).populate('user', 'fullName');

      for (const doctor of doctorsWithUnavailability) {
        for (const unavailPeriod of doctor.unavailability) {
          if (normalizeDateOnly(unavailPeriod.endDate) < normalizeDateOnly(getHospitalNow())) {
            continue;
          }

          const startDate = normalizeDateOnly(unavailPeriod.startDate);
          const endDate = normalizeDateOnly(unavailPeriod.endDate);

          const appointmentsToCancel = await Appointment.find({
            doctor: doctor._id,
            appointmentDate: { $gte: startDate, $lte: endDate },
            status: {
              $in: [
                APPOINTMENT_STATUS.PENDING,
                APPOINTMENT_STATUS.CONFIRMED,
                APPOINTMENT_STATUS.CHECKED_IN,
              ],
            },
            isActive: true,
          }).populate('patient', 'fullName');

          const affectedDates = new Set();

          for (const apt of appointmentsToCancel) {
            try {
              apt.status = APPOINTMENT_STATUS.CANCELLED;
              apt.cancellationReason = 'DOCTOR_UNAVAILABLE';
              apt.cancelledAt = getHospitalNow();
              apt.isInDoctorQueue = false;
              apt.queuePosition = null;
              apt.estimatedConsultationStartTime = null;
              apt.estimatedConsultationEndTime = null;
              apt.timingStatus = 'doctor-unavailable';
              apt.statusLabel = 'Doctor Unavailable';
              await apt.save();

              await Queue.updateOne(
                { doctor: doctor._id, date: apt.appointmentDate },
                {
                  $set: {
                    'entries.$[elem].status': QUEUE_ENTRY_STATUS.SKIPPED,
                    'entries.$[elem].delayReason': 'doctor-unavailable',
                    'entries.$[elem].queuePosition': null,
                    'entries.$[elem].estimatedConsultationStartTime': null,
                    'entries.$[elem].estimatedConsultationEndTime': null,
                  },
                },
                { arrayFilters: [{ 'elem.appointment': apt._id }] }
              );

              affectedDates.add(apt.appointmentDate.toISOString());

              if (apt.patient) {
                const appointmentDateStr = apt.appointmentDate.toISOString().split('T')[0];
                await notificationService.notifyAppointmentCancelledDueToUnavailability(
                  apt.patient._id,
                  {
                    appointmentId: apt._id,
                    doctorName: doctor.user?.fullName || 'Doctor',
                    appointmentDate: appointmentDateStr,
                  }
                );
              }
            } catch (_err) {
              // Continue
            }
          }

          for (const isoDate of affectedDates) {
            const d = new Date(isoDate);
            const recalculated = await QueueScheduler.recalculateQueue(doctor._id, d);
            if (recalculated) {
              broadcastQueueRecalculation({
                doctorId: doctor._id,
                date: d,
                queue: recalculated,
              });
            }
          }
        }
      }
    } catch (_err) {
      // Prevent cron crash
    }
  });
};

const initializeSchedulerJobs = () => {
  checkAttendanceTimeoutsJob();
  expireAppointmentsJob();
  cascadeCancelAppointmentsJob();
};

module.exports = {
  initializeSchedulerJobs,
  checkAttendanceTimeoutsJob,
  expireAppointmentsJob,
  cascadeCancelAppointmentsJob,
};
