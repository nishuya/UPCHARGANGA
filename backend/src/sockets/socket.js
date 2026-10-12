const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/token.util');
const config = require('../config/env');
const { patientRoom, queueRoom, hospitalRoom } = require('./rooms.util');
const SOCKET_EVENTS = require('./socketEvents');
const { USER_ROLES } = require('../constants/enums');
const User = require('../modules/auth/auth.model');
const Doctor = require('../modules/doctors/doctors.model');

let io = null;

/**
 * Load and validate the authenticated user from the database.
 * Ensures the account is still active and retrieve current role/hospital/assignments.
 * Fails closed: if the user doesn't exist, is deactivated, or verification fails, reject.
 */
const loadAndValidateUser = async (userId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new Error('User no longer exists.');
  }

  if (!user.isActive) {
    throw new Error('Account has been deactivated.');
  }

  return user;
};

/**
 * Verify that a doctor exists, is active, and belongs to the user's hospital.
 */
const validateDoctorAccess = async (doctorId, userHospitalId, userRole) => {
  const doctor = await Doctor.findById(doctorId);

  if (!doctor || !doctor.isActive) {
    throw new Error('Doctor not found or inactive.');
  }

  // Ensure doctor belongs to user's hospital (except admin, who can see any hospital)
  if (userRole !== USER_ROLES.ADMIN && doctor.hospital.toString() !== userHospitalId.toString()) {
    throw new Error('Doctor does not belong to your hospital.');
  }

  return doctor;
};

/**
 * Initializes the Socket.IO server exactly once, attached to the SAME
 * HTTP server Express listens on. This must only ever be called from
 * server.js. Calling it twice would create a second, independent
 * Socket.IO instance sharing no state with the first — every event
 * emitted through the "wrong" instance would silently vanish, and worse,
 * a client that somehow connected to both would receive every event
 * twice. The guard below makes that mistake fail loudly instead.
 */
const initializeSocket = (httpServer) => {
  if (io) {
    throw new Error('Socket.IO has already been initialized — initializeSocket() must only be called once.');
  }

  io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
    },
  });

  // JWT handshake authentication — mirrors the REST `protect` middleware.
  // A socket that fails this check never reaches the connection handler;
  // the client's `connect_error` event fires instead. Client connects as:
  //   io(url, { auth: { token: accessToken } })
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: token missing.'));
    }
    try {
      const decoded = verifyAccessToken(token); // { id, role, iat, exp }

      // Load user from database to verify account is still active and get current state
      const user = await loadAndValidateUser(decoded.id);

      // Attach full user object to socket (not just JWT payload)
      socket.user = {
        id: user._id.toString(),
        role: user.role,
        hospital: user.hospital,
        assignedDoctor: user.assignedDoctor,
        isActive: user.isActive,
      };

      next();
    } catch (err) {
      next(new Error(`Authentication error: ${err.message}`));
    }
  });

  // Registered exactly ONCE, here. Every socket's event handlers are
  // wired inside this single handler — there is no second `io.on('connection', ...)`
  // anywhere else in the codebase that could cause a client event to be
  // processed (and thus responded to) more than once.
  io.on('connection', (socket) => {
    const { id, role, hospital, assignedDoctor } = socket.user;

    console.log(`[SOCKET] User connected: ${id} (role: ${role})`);

    // Every patient automatically joins their own private room — this is
    // where "Notify Patient" events (verified, called, ETA updates) land.
    if (role === USER_ROLES.PATIENT) {
      socket.join(patientRoom(id));
    }

    // Staff members may join hospital-wide room for availability updates
    if ([USER_ROLES.RECEPTIONIST, USER_ROLES.DOCTOR_ASSISTANT, USER_ROLES.DOCTOR, USER_ROLES.ADMIN].includes(role)) {
      if (role === USER_ROLES.ADMIN) {
        // Admin joins all hospital rooms they need (can be subscribed to multiple)
        socket.join(hospitalRoom('admin')); // Special admin broadcast channel
      } else if (hospital) {
        // Staff joins only their own hospital room
        socket.join(hospitalRoom(hospital.toString()));
      }
    }

    // Staff explicitly opt into the specific doctor/date queue they're
    // currently viewing, with full authorization checks.
    socket.on(SOCKET_EVENTS.QUEUE_SUBSCRIBE, async ({ doctor, date } = {}) => {
      try {
        if (!doctor || !date) {
          return socket.emit('error', { message: 'doctor and date are required' });
        }

        // Authorization: verify user has permission to view this doctor's queue
        switch (role) {
          case USER_ROLES.PATIENT:
            // Patients cannot subscribe to queue rooms
            return socket.emit('error', { message: 'Patients cannot subscribe to staff queues' });

          case USER_ROLES.RECEPTIONIST:
            // Receptionists can only view queues for doctors in their hospital
            if (!hospital) {
              return socket.emit('error', { message: 'Your account is not assigned to a hospital' });
            }
            await validateDoctorAccess(doctor, hospital, role);
            break;

          case USER_ROLES.DOCTOR_ASSISTANT:
            // Assistants can only view queues for their assigned doctor
            if (!assignedDoctor || assignedDoctor.toString() !== doctor) {
              return socket.emit('error', { message: 'You are not assigned to this doctor' });
            }
            if (!hospital) {
              return socket.emit('error', { message: 'Your account is not assigned to a hospital' });
            }
            await validateDoctorAccess(doctor, hospital, role);
            break;

          case USER_ROLES.DOCTOR:
            // Doctors can only view their own queues
            if (doctor !== id) {
              return socket.emit('error', { message: 'You can only view your own queue' });
            }
            break;

          case USER_ROLES.ADMIN:
            // Admin can view any queue
            await validateDoctorAccess(doctor, hospital, role);
            break;

          default:
            return socket.emit('error', { message: 'Invalid role' });
        }

        socket.join(queueRoom(doctor, date));
        socket.emit('subscribed', { doctor, date, message: 'Successfully subscribed to queue' });
      } catch (error) {
        console.error(`[SOCKET] Queue subscribe error: ${error.message}`);
        socket.emit('error', { message: 'Subscription failed' });
      }
    });

    socket.on(SOCKET_EVENTS.QUEUE_UNSUBSCRIBE, ({ doctor, date } = {}) => {
      if (!doctor || !date) return;
      socket.leave(queueRoom(doctor, date));
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET] User disconnected: ${id}`);
    });
  });

  return io;
};

/**
 * Accessor used by socketEmitter.js. Throws loudly rather than silently
 * returning null/undefined if something tries to emit before the server
 * has started up — a missing event should never be mistaken for an
 * intentional no-op.
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initializeSocket(httpServer) first.');
  }
  return io;
};

module.exports = { initializeSocket, getIO };
