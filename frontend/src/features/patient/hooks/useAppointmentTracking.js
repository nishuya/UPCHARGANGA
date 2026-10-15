import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyAppointmentQueueEntry } from '../services/patient.api';
import { getSocket } from '../../../sockets/socketClient';
import { SOCKET_EVENTS } from '../../../constants/socketEvents';

const fetchAppointmentQueueEntry = async (appointmentId) => {
  const response = await getMyAppointmentQueueEntry(appointmentId);
  return response.data?.data?.queueEntry || response.data?.data || null;
};

/**
 * Real-time patient queue tracking hook.
 * - Fetches the authoritative queueEntry from GET /api/v1/patients/appointments/:id/queue-entry
 * - Subscribes to Socket.IO PATIENT_ETA_UPDATED and PATIENT_CALLED events
 * - Prevents stale events from overwriting newer state via monotonic queueVersion comparison
 * - Automatically re-synchronizes from REST upon socket reconnection
 */
const useAppointmentTracking = (appointmentId) => {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(null);

  const { data: queueEntry } = useQuery({
    queryKey: ['appointmentQueueEntry', appointmentId],
    queryFn: () => fetchAppointmentQueueEntry(appointmentId),
    enabled: !!appointmentId,
    refetchInterval: 30000,
    staleTime: 5000,
  });

  useEffect(() => {
    if (queueEntry) {
      setLive((prev) => {
        if (
          prev?.queueVersion &&
          queueEntry.queueVersion &&
          queueEntry.queueVersion < prev.queueVersion
        ) {
          return prev;
        }
        return {
          ...prev,
          ...queueEntry,
          appointmentId,
          queueStatus: queueEntry.status,
          called:
            prev?.called ||
            Boolean(queueEntry.called) ||
            ['called', 'in-consultation'].includes(queueEntry.status),
        };
      });
    }
  }, [queueEntry, appointmentId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !appointmentId) return undefined;

    const handleEtaUpdated = (payload) => {
      if (payload?.appointmentId && String(payload.appointmentId) !== String(appointmentId)) {
        return;
      }

      setLive((prev) => {
        if (
          prev?.queueVersion &&
          payload?.queueVersion &&
          payload.queueVersion < prev.queueVersion
        ) {
          return prev;
        }
        return {
          ...prev,
          ...payload,
          queueStatus: payload.status || prev?.queueStatus,
          called:
            Boolean(payload.called) ||
            ['called', 'in-consultation'].includes(payload.status),
        };
      });

      queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
    };

    const handleCalled = (payload) => {
      if (payload?.appointmentId && String(payload.appointmentId) !== String(appointmentId)) {
        return;
      }
      setLive((prev) => ({
        ...prev,
        ...payload,
        called: true,
        timingStatus: 'called',
        statusLabel: 'Called — Proceed to Room',
      }));
      queryClient.invalidateQueries({ queryKey: ['appointmentQueueEntry', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
    };

    const handleReconnect = () => {
      // Reconnecting clients fetch the latest persisted state before relying on new events
      queryClient.invalidateQueries({ queryKey: ['appointmentQueueEntry', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
    };

    socket.on(SOCKET_EVENTS.PATIENT_ETA_UPDATED, handleEtaUpdated);
    socket.on(SOCKET_EVENTS.PATIENT_CALLED, handleCalled);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off(SOCKET_EVENTS.PATIENT_ETA_UPDATED, handleEtaUpdated);
      socket.off(SOCKET_EVENTS.PATIENT_CALLED, handleCalled);
      socket.off('connect', handleReconnect);
    };
  }, [appointmentId, queryClient]);

  return live;
};

export default useAppointmentTracking;
