import io from 'socket.io-client';

import { getStoredAccessToken } from './api';
import { SOCKET_BASE_URL } from '../config/env';

let socket = null;
let socketCreation = null;
let socketGeneration = 0;

export const connectSocket = async () => {
  if (socket) {
    const generation = socketGeneration;
    const token = await getStoredAccessToken();
    if (generation !== socketGeneration || !socket) return null;
    if (token && socket.auth?.token !== token) {
      socket.auth = { ...socket.auth, token };
      if (socket.connected) {
        socket.disconnect().connect();
      }
    }
    return socket;
  }

  if (!socketCreation) {
    const generation = socketGeneration;
    const creation = (async () => {
      const token = await getStoredAccessToken();
      if (!token || generation !== socketGeneration) return null;

      socket = io(SOCKET_BASE_URL, {
        auth: { token },
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      socket.on('connect_error', (error) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('Socket connection error:', error?.message || error);
        }
      });

      return socket;
    });
    const trackedCreation = creation.finally(() => {
      if (socketCreation === trackedCreation) socketCreation = null;
    });
    socketCreation = trackedCreation;
  }

  return socketCreation;
};

export const disconnectSocket = () => {
  socketGeneration += 1;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socketCreation = null;
};

export const getSocket = () => socket;

export default {
  connectSocket,
  disconnectSocket,
  getSocket,
};
