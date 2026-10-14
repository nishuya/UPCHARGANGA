import io from 'socket.io-client';
import { getAccessToken } from '../services/tokenStore';

let socket = null;
let connectionError = null;

const resolveSocketUrl = () => {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    try {
      return new URL(import.meta.env.VITE_API_BASE_URL).origin;
    } catch {
      // Fallback below
    }
  }
  return 'http://localhost:5000';
};

export const connectSocket = () => {
  if (socket?.connected) {
    return socket;
  }

  const token = getAccessToken();
  if (!token) {
    return null;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(resolveSocketUrl(), {
    auth: {
      token,
    },
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    connectionError = null;
  });

  socket.on('connect_error', (error) => {
    const errorMsg = `Socket connection failed: ${error?.message || 'Unknown error'}`;
    connectionError = errorMsg;
    console.error('[SOCKET] Connection error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.log('[SOCKET] Disconnected:', reason);
  });

  socket.on('authentication_error', (error) => {
    const errorMsg = `Socket authentication failed: ${error?.message || 'Invalid token'}`;
    connectionError = errorMsg;
    console.error('[SOCKET] Auth error:', error);
    window.dispatchEvent(new Event('socket:auth-failed'));
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    connectionError = null;
  }
};

export const getSocket = () => socket;

export const getSocketConnectionError = () => connectionError;

export default {
  connectSocket,
  disconnectSocket,
  getSocket,
  getSocketConnectionError,
};
