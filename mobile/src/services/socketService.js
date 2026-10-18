import io from 'socket.io-client';

import { getStoredAccessToken } from './api';
import { SOCKET_BASE_URL } from '../config/env';

let socket = null;

export const connectSocket = async () => {
  if (socket?.connected) {
    return socket;
  }

  const token = await getStoredAccessToken();
  if (!token) {
    return null;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_BASE_URL, {
    auth: { token },
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect_error', (error) => {
    console.log('Socket connection error:', error?.message || error);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;

export default {
  connectSocket,
  disconnectSocket,
  getSocket,
};
