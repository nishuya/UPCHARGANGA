import io from 'socket.io-client';
import { getAccessToken } from '../services/tokenStore';

/**
 * Global Socket.IO Client
 * Lifecycle managed by AuthContext (connect on login, disconnect on logout)
 * Accessible via useSocket hook or directly from this module
 */

let socket = null;
let connectionError = null;

/**
 * Connect to Socket.IO server with JWT authentication
 * Called by AuthContext after successful login
 */
export const connectSocket = () => {
  if (socket?.connected) {
    console.log('[SOCKET] Already connected, skipping reconnect');
    return socket;
  }

  const token = getAccessToken();
  if (!token) {
    console.warn('[SOCKET] No auth token available, cannot connect');
    return null;
  }

  console.log('[SOCKET] Connecting to server with JWT auth...');

  socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
    auth: {
      token,
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[SOCKET] Connected to server');
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
    // Auth failed - user should be logged out by backend
    // Dispatch logout event so AuthContext can clean up
    window.dispatchEvent(new Event('socket:auth-failed'));
  });

  return socket;
};

/**
 * Disconnect from Socket.IO server
 * Called by AuthContext on logout
 */
export const disconnectSocket = () => {
  if (socket) {
    console.log('[SOCKET] Disconnecting from server');
    socket.disconnect();
    socket = null;
    connectionError = null;
  }
};

/**
 * Get current socket instance
 * Returns null if not connected
 */
export const getSocket = () => socket;

/**
 * Get latest connection error (if any)
 * Returns null if no error
 */
export const getSocketConnectionError = () => connectionError;

export default {
  connectSocket,
  disconnectSocket,
  getSocket,
  getSocketConnectionError,
};
