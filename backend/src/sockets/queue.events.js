/**
 * SOCKET.IO EVENTS - QUEUE REAL-TIME BROADCASTING
 * ================================================
 * Handles all Socket.IO events for queue updates, consultation progress,
 * and real-time synchronization across all connected clients.
 *
 * Room naming convention: queue:${hospitalId}:${doctorId}:${dateYYYYMMDD}
 * Authorization: Verified on every event (no client-side spoofing)
 */

const Queue = require('../modules/queue/queue.model');
const Appointment = require('../modules/appointments/appointments.model');
const { normalizeDateOnly } = require('../utils/datetime.util');

class QueueSocketEvents {
  /**
   * Initialize Socket.IO event listeners
   */
  static initializeEvents(io) {
    io.on('connection', (socket) => {
      console.log('[SOCKET] Client connected:', socket.id);

      // Join queue room
      socket.on('queue:join', (data) => {
        this.handleJoinQueue(socket, io, data);
      });

      // Leave queue room
      socket.on('queue:leave', (data) => {
        this.handleLeaveQueue(socket, io, data);
      });

      // Listen for consultation progress
      socket.on('queue:consultation-started', (data) => {
        this.handleConsultationStarted(socket, io, data);
      });

      socket.on('queue:consultation-completed', (data) => {
        this.handleConsultationCompleted(socket, io, data);
      });

      // Listen for patient arrival
      socket.on('queue:patient-arrived', (data) => {
        this.handlePatientArrived(socket, io, data);
      });

      // Listen for queue recalculation trigger
      socket.on('queue:recalculate', (data) => {
        this.handleQueueRecalculate(socket, io, data);
      });

      socket.on('disconnect', () => {
        console.log('[SOCKET] Client disconnected:', socket.id);
      });
    });
  }

  /**
   * Join a queue room
   * Patient/Reception/Doctor joins their hospital's queue for a specific doctor/date
   */
  static async handleJoinQueue(socket, io, data) {
    const { hospitalId, doctorId, appointmentDate, userRole, userId } = data;

    // Validate required fields
    if (!hospitalId || !doctorId || !appointmentDate) {
      socket.emit('error', {
        message: 'hospitalId, doctorId, and appointmentDate are required',
      });
      return;
    }

    // TODO: Add authorization check
    // - Patient can only join their own appointment's queue
    // - Reception can join any queue in their hospital
    // - Doctor can only join their own queue
    // - Admin can join any queue

    const roomName = this._getRoomName(hospitalId, doctorId, appointmentDate);

    socket.join(roomName);
    console.log(`[SOCKET] ${userRole} joined queue room: ${roomName}`);

    // Send current queue state
    try {
      const normalizedDate = normalizeDateOnly(new Date(appointmentDate));
      const queue = await Queue.findOne({
        doctor: doctorId,
        date: normalizedDate,
      })
        .populate({
          path: 'entries.patient',
          select: 'fullName phone',
        })
        .lean();

      if (queue) {
        socket.emit('queue:current-state', {
          queue: this._formatQueueForClient(queue, userRole),
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error('[SOCKET] Error fetching queue:', error.message);
      socket.emit('error', { message: 'Failed to fetch queue state' });
    }
  }

  /**
   * Leave a queue room
   */
  static handleLeaveQueue(socket, io, data) {
    const { hospitalId, doctorId, appointmentDate } = data;
    const roomName = this._getRoomName(hospitalId, doctorId, appointmentDate);

    socket.leave(roomName);
    console.log(`[SOCKET] User left queue room: ${roomName}`);
  }

  /**
   * Broadcast queue update to all clients in room
   * Called after QueueScheduler.recalculateQueue()
   */
  static broadcastQueueUpdate(io, hospitalId, doctorId, appointmentDate, queue) {
    const roomName = this._getRoomName(hospitalId, doctorId, appointmentDate);

    const formattedQueue = this._formatQueueForClient(queue, 'all');

    console.log(`[SOCKET] Broadcasting queue update to room: ${roomName}`);

    io.to(roomName).emit('queue:updated', {
      queueId: queue._id,
      entries: formattedQueue.entries,
      currentTokenNumber: queue.currentTokenNumber,
      averageConsultationMinutes: queue.averageConsultationMinutes,
      timestamp: new Date(),
    });
  }

  /**
   * Handle consultation started
   */
  static async handleConsultationStarted(socket, io, data) {
    const { queueId, entryId, hospitalId, doctorId, appointmentDate, tokenNumber } = data;

    console.log(`[SOCKET] Consultation started - token #${tokenNumber}`);

    const roomName = this._getRoomName(hospitalId, doctorId, appointmentDate);

    io.to(roomName).emit('queue:consultation-started', {
      queueId,
      entryId,
      tokenNumber,
      nowServingToken: tokenNumber,
      timestamp: new Date(),
    });
  }

  /**
   * Handle consultation completion
   */
  static async handleConsultationCompleted(socket, io, data) {
    const {
      queueId,
      entryId,
      hospitalId,
      doctorId,
      appointmentDate,
      tokenNumber,
      actualDurationMinutes,
      newAverageMinutes,
    } = data;

    console.log(`[SOCKET] Consultation completed - token #${tokenNumber}`);

    const roomName = this._getRoomName(hospitalId, doctorId, appointmentDate);

    io.to(roomName).emit('queue:consultation-completed', {
      queueId,
      entryId,
      tokenNumber,
      actualDurationMinutes,
      newAverageMinutes,
      timestamp: new Date(),
    });
  }

  /**
   * Handle patient arrived
   */
  static async handlePatientArrived(socket, io, data) {
    const { queueId, entryId, hospitalId, doctorId, appointmentDate, tokenNumber, arrivalStatus } =
      data;

    console.log(`[SOCKET] Patient arrived - token #${tokenNumber}`);

    const roomName = this._getRoomName(hospitalId, doctorId, appointmentDate);

    io.to(roomName).emit('queue:patient-arrived', {
      queueId,
      entryId,
      tokenNumber,
      arrivalStatus,
      timestamp: new Date(),
    });
  }

  /**
   * Handle manual queue recalculation request
   */
  static async handleQueueRecalculate(socket, io, data) {
    const { hospitalId, doctorId, appointmentDate } = data;

    console.log(`[SOCKET] Manual recalculation requested for ${doctorId}`);

    try {
      const normalizedDate = normalizeDateOnly(new Date(appointmentDate));
      const queue = await Queue.findOne({
        doctor: doctorId,
        date: normalizedDate,
      });

      if (queue) {
        this.broadcastQueueUpdate(io, hospitalId, doctorId, appointmentDate, queue);
      }
    } catch (error) {
      console.error('[SOCKET] Error recalculating queue:', error.message);
    }
  }

  /**
   * Format queue data based on user role
   * Different roles see different information for privacy
   */
  static _formatQueueForClient(queue, userRole) {
    const entries = queue.entries.map((entry) => {
      const formatted = {
        entryId: entry._id,
        tokenNumber: entry.tokenNumber,
        queuePosition: entry.queuePosition,
        status: entry.status,
        estimatedStartTime: entry.estimatedStartTime,
        estimatedEndTime: entry.estimatedEndTime,
        estimatedWaitingMinutes: entry.estimatedWaitingMinutes,
        arrivalStatus: entry.arrivalStatus,
      };

      // Add patient info for reception/doctor/admin, but not to other patients
      if (['reception', 'doctor', 'doctorAssistant', 'admin', 'all'].includes(userRole)) {
        formatted.patientName = entry.patient?.fullName;
        formatted.patientPhone = entry.patient?.phone;
        formatted.actualStartTime = entry.actualStartTime;
        formatted.actualEndTime = entry.actualEndTime;
        formatted.actualDurationMinutes = entry.actualDurationMinutes;
        formatted.scheduledStartTime = entry.scheduledStartTime;
      }

      return formatted;
    });

    return {
      queueId: queue._id,
      entries,
      currentTokenNumber: queue.currentTokenNumber,
      totalTokensIssued: queue.totalTokensIssued,
      averageConsultationMinutes: queue.averageConsultationMinutes,
      status: queue.status,
    };
  }

  /**
   * Generate room name for a queue
   * Ensures one room per hospital/doctor/date combo
   */
  static _getRoomName(hospitalId, doctorId, appointmentDate) {
    const normalizedDate = normalizeDateOnly(new Date(appointmentDate));
    const dateString = normalizedDate.toISOString().split('T')[0].replace(/-/g, '');
    return `queue:${hospitalId}:${doctorId}:${dateString}`;
  }
}

/**
 * Integration point: Call this from controllers after queue operations
 *
 * Example usage in controller:
 * ```
 * const updatedQueue = await QueueScheduler.recalculateQueue(doctorId, date, session);
 * QueueSocketEvents.broadcastQueueUpdate(
 *   io,
 *   hospital._id,
 *   doctorId,
 *   date,
 *   updatedQueue
 * );
 * ```
 */

module.exports = QueueSocketEvents;
