const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/token.util');
const config = require('../config/env');
const { patientRoom, queueRoom, hospitalRoom } = require('./rooms.util');
const SOCKET_EVENTS = require('./socketEvents');
const { USER_ROLES } = require('../constants/enums');
const User = require('../modules/auth/auth.model');
const Doctor = require('../modules/doctors/doctors.model');

let io = null;

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

const validateDoctorAccess = async (doctorId, userHospitalId, userRole, userId) => {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor || !doctor.isActive) {
    throw new Error('Doctor not found or inactive.');
  }

  if (userRole === USER_ROLES.DOCTOR) {
    const matchesProfile =
      doctor._id.toString() === userId.toString() ||
      (doctor.user && doctor.user.toString() === userId.toString());
    if (!matchesProfile) {
      throw new Error('You can only view your own queue.');
    }
    return doctor;
  }

  if (
    userRole !== USER_ROLES.ADMIN &&
    (!userHospitalId || doctor.hospital.toString() !== userHospitalId.toString())
  ) {
    throw new Error('Doctor does not belong to your hospital.');
  }

  return doctor;
};

const initializeSocket = (httpServer) => {
  if (io) {
    throw new Error('Socket.IO has already been initialized — initializeSocket() must only be called once.');
  }

  const allowedOrigins =
    Array.isArray(config.clientUrls) && config.clientUrls.length
      ? config.clientUrls
      : [config.clientUrl];

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: token missing.'));
    }
    try {
      const decoded = verifyAccessToken(token);
      const user = await loadAndValidateUser(decoded.id);

      socket.user = {
        id: user._id.toString(),
        role: user.role,
        hospital: user.hospital?._id ? user.hospital._id.toString() : user.hospital?.toString(),
        assignedDoctor: user.assignedDoctor?._id
          ? user.assignedDoctor._id.toString()
          : user.assignedDoctor?.toString(),
        isActive: user.isActive,
      };

      next();
    } catch (err) {
      next(new Error(`Authentication error: ${err.message}`));
    }
  });

  io.on('connection', (socket) => {
    const { id, role, hospital, assignedDoctor } = socket.user;

    if (role === USER_ROLES.PATIENT) {
      socket.join(patientRoom(id));
    }

    if (
      [
        USER_ROLES.RECEPTIONIST,
        USER_ROLES.DOCTOR_ASSISTANT,
        USER_ROLES.DOCTOR,
        USER_ROLES.ADMIN,
      ].includes(role)
    ) {
      if (role === USER_ROLES.ADMIN) {
        socket.join(hospitalRoom('admin'));
      } else if (hospital) {
        socket.join(hospitalRoom(hospital.toString()));
      }
    }

    socket.on(SOCKET_EVENTS.QUEUE_SUBSCRIBE, async ({ doctor, date } = {}) => {
      try {
        if (!doctor || !date) {
          return socket.emit('error', { message: 'doctor and date are required' });
        }

        switch (role) {
          case USER_ROLES.PATIENT:
            return socket.emit('error', { message: 'Patients cannot subscribe to staff queues' });

          case USER_ROLES.RECEPTIONIST:
            if (!hospital) {
              return socket.emit('error', { message: 'Your account is not assigned to a hospital' });
            }
            await validateDoctorAccess(doctor, hospital, role, id);
            break;

          case USER_ROLES.DOCTOR_ASSISTANT:
            if (!assignedDoctor || assignedDoctor.toString() !== doctor.toString()) {
              return socket.emit('error', { message: 'You are not assigned to this doctor' });
            }
            if (!hospital) {
              return socket.emit('error', { message: 'Your account is not assigned to a hospital' });
            }
            await validateDoctorAccess(doctor, hospital, role, id);
            break;

          case USER_ROLES.DOCTOR:
            await validateDoctorAccess(doctor, hospital, role, id);
            break;

          case USER_ROLES.ADMIN:
            await validateDoctorAccess(doctor, hospital, role, id);
            break;

          default:
            return socket.emit('error', { message: 'Invalid role' });
        }

        socket.join(queueRoom(doctor, date));
        socket.emit('subscribed', { doctor, date, message: 'Successfully subscribed to queue' });
      } catch (error) {
        socket.emit('error', { message: 'Subscription failed' });
      }
    });

    socket.on(SOCKET_EVENTS.QUEUE_UNSUBSCRIBE, ({ doctor, date } = {}) => {
      if (!doctor || !date) return;
      socket.leave(queueRoom(doctor, date));
    });

    socket.on('disconnect', () => {});
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initializeSocket(httpServer) first.');
  }
  return io;
};

module.exports = { initializeSocket, getIO };
