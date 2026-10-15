import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../../../sockets/socketClient';
import { SOCKET_EVENTS } from '../../../constants/socketEvents';

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Reception real-time queue synchronization hook.
 * - Subscribes to each doctor's queue room and receives hospital-wide QUEUE_UPDATED broadcasts
 * - Tracks monotonic queueVersion per doctor queue to ignore stale out-of-order events
 * - Automatically refetches authoritative state on socket reconnection
 */
const useReceptionLiveUpdates = (doctorIds = []) => {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const versionByQueueRef = useRef(new Map());

  const handleQueueUpdated = useCallback(
    (payload) => {
      if (payload?.queueId && payload?.queueVersion) {
        const key = String(payload.queueId);
        const lastVersion = versionByQueueRef.current.get(key) || 0;
        if (payload.queueVersion < lastVersion) {
          return;
        }
        versionByQueueRef.current.set(key, payload.queueVersion);
      }
      queryClient.invalidateQueries({ queryKey: ['todaysAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['searchBooking'] });
    },
    [queryClient]
  );

  const doctorIdsKey = [...new Set(doctorIds)].sort().join(',');

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const date = todayISO();
    const uniqueIds = doctorIdsKey ? doctorIdsKey.split(',') : [];

    setIsConnected(socket.connected);

    const handleConnect = () => {
      setIsConnected(true);
      uniqueIds.forEach((doctorId) => {
        socket.emit(SOCKET_EVENTS.QUEUE_SUBSCRIBE, { doctor: doctorId, date });
      });
      // Synchronize full authoritative state on reconnect before relying on incremental events
      queryClient.invalidateQueries({ queryKey: ['todaysAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['searchBooking'] });
    };

    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    uniqueIds.forEach((doctorId) => {
      socket.emit(SOCKET_EVENTS.QUEUE_SUBSCRIBE, { doctor: doctorId, date });
    });

    socket.on(SOCKET_EVENTS.QUEUE_UPDATED, handleQueueUpdated);

    return () => {
      uniqueIds.forEach((doctorId) => {
        socket.emit(SOCKET_EVENTS.QUEUE_UNSUBSCRIBE, { doctor: doctorId, date });
      });
      socket.off(SOCKET_EVENTS.QUEUE_UPDATED, handleQueueUpdated);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [doctorIdsKey, handleQueueUpdated, queryClient]);

  return { isConnected };
};

export default useReceptionLiveUpdates;
