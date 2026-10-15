import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../../../sockets/socketClient';
import { SOCKET_EVENTS } from '../../../constants/socketEvents';

/**
 * Explicitly opts into ONE doctor/date queue room at a time (see
 * backend/src/sockets/socket.js — QUEUE_SUBSCRIBE/QUEUE_UNSUBSCRIBE),
 * switching rooms cleanly whenever the assistant picks a different
 * doctor or date. QUEUE_UPDATED's payload only carries doctor-wide
 * counters (currentTokenNumber, totalTokensIssued, averageConsultation-
 * Minutes, status) — not the full current-patient/waiting-list detail
 * this dashboard renders — so it's used purely as a "something changed,
 * go refetch" signal; useQueue's REST fetch remains the only thing
 * actually rendered.
 *
 * Optimized with useCallback for stable handler references to prevent
 * unnecessary effect re-runs and multiple subscriptions.
 */
const useQueueLiveUpdates = (doctorId, date) => {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  const handleQueueUpdated = useCallback(() => {
    console.log('[QUEUE UPDATES] QUEUE_UPDATED received, invalidating cache for doctor:', doctorId, 'date:', date);
    queryClient.invalidateQueries({ queryKey: ['doctorQueue', doctorId, date] });
  }, [doctorId, date, queryClient]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !doctorId || !date) {
      setIsConnected(false);
      return undefined;
    }

    // Set initial connection state
    setIsConnected(socket.connected);

    // Handler for connect events
    const handleConnect = () => {
      console.log('[QUEUE UPDATES] Socket connected, subscribing to queue');
      setIsConnected(true);
      // Re-subscribe to the queue when reconnecting
      socket.emit(SOCKET_EVENTS.QUEUE_SUBSCRIBE, { doctor: doctorId, date });
    };

    const handleDisconnect = () => {
      console.log('[QUEUE UPDATES] Socket disconnected');
      setIsConnected(false);
    };

    // Attach connection event handlers
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // Subscribe to this doctor's queue updates
    console.log('[QUEUE UPDATES] Subscribing to queue for doctor:', doctorId, 'date:', date);
    socket.emit(SOCKET_EVENTS.QUEUE_SUBSCRIBE, { doctor: doctorId, date });
    socket.on(SOCKET_EVENTS.QUEUE_UPDATED, handleQueueUpdated);

    // Cleanup
    return () => {
      console.log('[QUEUE UPDATES] Unsubscribing from queue');
      socket.emit(SOCKET_EVENTS.QUEUE_UNSUBSCRIBE, { doctor: doctorId, date });
      socket.off(SOCKET_EVENTS.QUEUE_UPDATED, handleQueueUpdated);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [doctorId, date, handleQueueUpdated]);

  return { isConnected };
};

export default useQueueLiveUpdates;
