import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../../../sockets/socketClient';
import { SOCKET_EVENTS } from '../../../constants/socketEvents';

const useQueueLiveUpdates = (doctorId, date) => {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const lastVersionRef = useRef(0);

  const handleQueueUpdated = useCallback(
    (payload) => {
      if (payload?.queueVersion && payload.queueVersion < lastVersionRef.current) {
        return;
      }
      if (payload?.queueVersion) {
        lastVersionRef.current = payload.queueVersion;
      }
      queryClient.invalidateQueries({ queryKey: ['doctorQueue', doctorId, date] });
    },
    [doctorId, date, queryClient]
  );

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !doctorId || !date) {
      setIsConnected(false);
      return undefined;
    }

    setIsConnected(socket.connected);

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit(SOCKET_EVENTS.QUEUE_SUBSCRIBE, { doctor: doctorId, date });
      queryClient.invalidateQueries({ queryKey: ['doctorQueue', doctorId, date] });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    socket.emit(SOCKET_EVENTS.QUEUE_SUBSCRIBE, { doctor: doctorId, date });
    socket.on(SOCKET_EVENTS.QUEUE_UPDATED, handleQueueUpdated);

    return () => {
      socket.emit(SOCKET_EVENTS.QUEUE_UNSUBSCRIBE, { doctor: doctorId, date });
      socket.off(SOCKET_EVENTS.QUEUE_UPDATED, handleQueueUpdated);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [doctorId, date, handleQueueUpdated, queryClient]);

  return { isConnected };
};

export default useQueueLiveUpdates;
