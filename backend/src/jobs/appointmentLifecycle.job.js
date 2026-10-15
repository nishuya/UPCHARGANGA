const cron = require('node-cron');
const Appointment = require('../modules/appointments/appointments.model');
const Doctor = require('../modules/doctors/doctors.model');
const Queue = require('../modules/queue/queue.model');
const QueueScheduler = require('../modules/queue/queue.scheduler.service');
const notificationService = require('../modules/notifications/notifications.service');
const { getHospitalNow, normalizeDateOnly, combineDateAndTime } = require('../utils/datetime.util');
const { APPOINTMENT_STATUS } = require('../constants/enums');
const { broadcastQueueRecalculation } = require('../sockets/socketEmitter');
const socketEmitter = require('../sockets/socketEmitter');

/**
 * Appointment Lifecycle Scheduler Jobs:
 * - Expire appointments when consultation cutoff passes
 * - Cancel appointments when doctor is marked unavailable
 */

/**
 * Job 1.5: Check and apply attendance timeouts
 * Runs every minute to catch 5-minute attendance windows as they close
 *
 * Logic:
 * - Find all queues for today with WAITING entries that haven't arrived
 * - For each entry whose attendance window has closed:
 *   - Mark attendanceTimeoutApplied = true (idempotent)
 *   - Recalculate the entire queue (shifts future times by 5 minutes)
 *   - Broadcast updated queue to all connected clients
 *
 * IDEMPOTENCY: The attendanceTimeoutApplied flag ensures the timeout is
 * applied EXACTLY ONCE, even if multiple backend instances run this job
 * or it runs multiple times per minute. Without this flag, we'd apply
 * the 5-minute delay multiple times.
 */
const checkAttendanceTimeoutsJob = () => {
  console.log('⏰ [ATTENDANCE] Attendance timeout check job started');

  cron.schedule('*/1 * * * *', async () => {
    try {
      const now = getHospitalNow();
      const today = normalizeDateOnly(now);

      console.log(`🔍 [ATTENDANCE] Checking for attendance timeouts at ${now.toISOString()}`);

      // Find all queues for today (these are the active queues)
      const todaysQueues = await Queue.find({
        date: today,
        status: 'active',
      });

      console.log(`📋 [ATTENDANCE] Found ${todaysQueues.length} active queues for today`);

      for (const queue of todaysQueues) {
        try {
          let hasTimeoutToApply = false;

          // Check each waiting entry
          for (const entry of queue.entries) {
            // Skip if not waiting, already arrived, or timeout already applied
            if (entry.status !== 'waiting' || entry.arrivalStatus !== 'not-arrived') continue;
            if (entry.attendanceTimeoutApplied || !entry.attendanceWindowClosesAt) continue;

            // Check if window has closed
            if (now >= entry.attendanceWindowClosesAt) {
              console.log(
                `⏰ [ATTENDANCE] Timeout window closed for token ${entry.tokenNumber} ` +
                `(window closed at ${entry.attendanceWindowClosesAt.toISOString()})`
              );
              hasTimeoutToApply = true;
            }
          }

          // If any timeouts need to be applied, recalculate the queue
          // (QueueScheduler will mark them as applied idempotently)
          if (hasTimeoutToApply) {
            console.log(
              `⏱️  [ATTENDANCE] Recalculating queue for doctor ${queue.doctor} to apply timeouts`
            );

            const recalculatedQueue = await QueueScheduler.recalculateQueue(
              queue.doctor,
              queue.date
            );

            // Broadcast the updated queue with new estimated times
            if (recalculatedQueue) {
              broadcastQueueRecalculation({
                doctorId: queue.doctor,
                date: queue.date,
                queue: recalculatedQueue,
              });

              console.log(
                `✅ [ATTENDANCE] Queue recalculated and broadcast for doctor ${queue.doctor}`
              );
            }
          }
        } catch (err) {
          console.error(
            `❌ [ATTENDANCE] Error processing queue ${queue._id}:`,
            err.message
          );
        }
      }
    } catch (err) {
      console.error('❌ [ATTENDANCE] Attendance timeout check job failed:', err.message);
    }
  });

  console.log('✅ [ATTENDANCE] Attendance timeout check job initialized');
};

/**
 * Job 1: Expire appointments when consultation cutoff passes
 * Runs every minute to check if appointments have passed their cutoff time
 *
 * Logic:
 * - Find all CONFIRMED appointments where cutoffTime has passed
 * - Mark them as EXPIRED
 * - Notify patients
 * - Broadcast Socket.IO updates
 */
const expireAppointmentsJob = () => {
  console.log('⏰ [SCHEDULER] Appointment expiration job started');

  cron.schedule('*/1 * * * *', async () => {
    try {
      const now = getHospitalNow();
      console.log(`🔍 [EXPIRE] Checking for expired appointments at ${now.toISOString()}`);

      // Find all appointments that should have been consulted by now
      const expiredAppointments = await Appointment.find({
        status: APPOINTMENT_STATUS.CONFIRMED,
        cutoffTime: { $lt: now },
        isActive: true,
      }).populate('patient', 'firstName lastName');

      if (expiredAppointments.length > 0) {
        console.log(`⚠️  [EXPIRE] Found ${expiredAppointments.length} appointments to expire`);

        for (const apt of expiredAppointments) {
          try {
            // Update appointment status
            apt.status = APPOINTMENT_STATUS.EXPIRED;
            await apt.save();

            console.log(`✅ [EXPIRE] Appointment ${apt._id} marked as EXPIRED`);

            // Notify patient
            if (apt.patient) {
              const appointmentDate = apt.appointmentDate
                .toISOString()
                .split('T')[0];
              await notificationService.notifyAppointmentExpired(apt.patient._id, {
                appointmentId: apt._id,
                appointmentDate,
              });
            }

            // Emit Socket.IO update
            socketEmitter.emitToHospital(apt.hospitalId, 'appointmentExpired', {
              appointmentId: apt._id,
              status: APPOINTMENT_STATUS.EXPIRED,
              patientId: apt.patient?._id,
            });
          } catch (err) {
            console.error(
              `❌ [EXPIRE] Error expiring appointment ${apt._id}:`,
              err.message
            );
          }
        }
      }
    } catch (err) {
      console.error('❌ [EXPIRE] Appointment expiration job failed:', err.message);
    }
  });

  console.log('✅ [SCHEDULER] Appointment expiration job initialized');
};

/**
 * Job 2: Cancel appointments when doctor unavailability is registered
 * Runs every 2 minutes to catch cascading cancellations
 *
 * Logic:
 * - Find all appointments with CONFIRMED status that overlap with doctor unavailability periods
 * - Cancel those appointments (set status to CANCELLED, reason to DOCTOR_UNAVAILABLE)
 * - Delete associated queue entries
 * - Notify patients with "Sorry, Dr. X is not available on..."
 * - Emit Socket.IO updates
 */
const cascadeCancelAppointmentsJob = () => {
  console.log('⏰ [SCHEDULER] Cascade cancel appointments job started');

  cron.schedule('*/2 * * * *', async () => {
    try {
      console.log(`🔍 [CASCADE] Checking for appointments in unavailable doctor periods`);

      // Get all doctors with active unavailability periods
      const doctorsWithUnavailability = await Doctor.find({
        'unavailability.0': { $exists: true },
        isActive: true,
      });

      console.log(
        `📋 [CASCADE] Checking ${doctorsWithUnavailability.length} doctors with unavailability periods`
      );

      for (const doctor of doctorsWithUnavailability) {
        for (const unavailPeriod of doctor.unavailability) {
          // Only process unavailability that has not yet ended
          if (unavailPeriod.endDate < getHospitalNow()) {
            continue;
          }

          // Normalize dates to midnight for range matching
          const startDate = normalizeDateOnly(unavailPeriod.startDate);
          const endDate = normalizeDateOnly(unavailPeriod.endDate);

          // Find appointments in this unavailability period
          const appointmentsToCancel = await Appointment.find({
            doctor: doctor._id,
            appointmentDate: { $gte: startDate, $lte: endDate },
            status: APPOINTMENT_STATUS.CONFIRMED,
            isActive: true,
          }).populate('patient', 'firstName lastName hospitalId');

          if (appointmentsToCancel.length > 0) {
            console.log(
              `⚠️  [CASCADE] Found ${appointmentsToCancel.length} appointments to cancel for Dr. ${doctor.fullName}`
            );

            for (const apt of appointmentsToCancel) {
              try {
                // Cancel appointment
                apt.status = APPOINTMENT_STATUS.CANCELLED;
                apt.cancellationReason = 'DOCTOR_UNAVAILABLE';
                apt.cancelledAt = getHospitalNow();
                await apt.save();

                console.log(
                  `✅ [CASCADE] Appointment ${apt._id} cancelled (doctor unavailable)`
                );

                // Delete associated queue entry
                const queueEntry = await QueueEntry.findOneAndDelete({
                  appointment: apt._id,
                  isActive: true,
                });

                if (queueEntry) {
                  console.log(
                    `✅ [CASCADE] Queue entry ${queueEntry._id} deleted`
                  );
                }

                // Notify patient
                if (apt.patient) {
                  const appointmentDateStr = apt.appointmentDate
                    .toISOString()
                    .split('T')[0];
                  await notificationService.notifyAppointmentCancelledDueToUnavailability(
                    apt.patient._id,
                    {
                      appointmentId: apt._id,
                      doctorName: doctor.fullName,
                      appointmentDate: appointmentDateStr,
                    }
                  );
                }

                // Emit Socket.IO update
                socketEmitter.emitToHospital(apt.hospitalId, 'appointmentCancelled', {
                  appointmentId: apt._id,
                  status: APPOINTMENT_STATUS.CANCELLED,
                  reason: 'DOCTOR_UNAVAILABLE',
                  doctorName: doctor.fullName,
                  patientId: apt.patient?._id,
                });
              } catch (err) {
                console.error(
                  `❌ [CASCADE] Error cancelling appointment ${apt._id}:`,
                  err.message
                );
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(
        '❌ [CASCADE] Cascade cancel appointments job failed:',
        err.message
      );
    }
  });

  console.log('✅ [SCHEDULER] Cascade cancel appointments job initialized');
};

/**
 * Initialize all scheduler jobs
 */
const initializeSchedulerJobs = () => {
  console.log('🚀 [SCHEDULER] Initializing all appointment lifecycle jobs...');
  checkAttendanceTimeoutsJob();
  expireAppointmentsJob();
  cascadeCancelAppointmentsJob();
  console.log('✅ [SCHEDULER] All jobs initialized successfully');
};

module.exports = {
  initializeSchedulerJobs,
  checkAttendanceTimeoutsJob,
  expireAppointmentsJob,
  cascadeCancelAppointmentsJob,
};
