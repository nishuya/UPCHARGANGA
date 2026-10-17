import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../../services/apiClient';
import { getSocket } from '../../../sockets/socketClient';
import { SOCKET_EVENTS } from '../../../constants/socketEvents';

/**
 * Layers real-time updates on top of the REST-fetched appointment. The
 * server emits these events into the patient's own private room (see
 * backend/src/sockets/socket.js — every patient auto-joins `patient:<id>`
 * on connect), so no explicit subscribe/unsubscribe call is needed here,
 * unlike the doctor/reception queue-board views which opt into a specific
 * doctor/date room.
 *
 * Returns only the fields that can change live; the page merges these
 * over the REST snapshot rather than replacing it, since the socket
 * payloads are deliberately small deltas, not the full appointment.
 *
 * The patient sees the backend's current queue estimate and status. Same-day
 * estimates are refreshed periodically; the local clock is used only to hide
 * an estimate as soon as it has passed while the next server update is pending.
 */

/**
 * Fetch appointment's queue entry to get real-time estimated times
 */
const fetchAppointmentQueueEntry = async (appointmentId) => {
  const response = await apiClient.get(`/patients/appointments/${appointmentId}/queue-entry`);
  return response.data.data.queueEntry;
};

const useAppointmentTracking = (appointmentId) => {
  const [live, setLive] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Polling keeps time-based estimates current even when no queue event fires.
  const { data: queueEntry, isPending, isError } = useQuery({
    queryKey: ['appointmentQueueEntry', appointmentId],
    queryFn: () => fetchAppointmentQueueEntry(appointmentId),
    enabled: !!appointmentId,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  // Initialize live data from queue entry
  useEffect(() => {
    if (queueEntry) {
      setLive((prev) => ({
        ...prev,
        ...queueEntry,
        appointmentId,
        called: queueEntry.estimateStatus === 'called',
      }));
    }
  }, [queueEntry, appointmentId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !appointmentId) return undefined;

    const handleEtaUpdated = (payload) => {
      if (payload?.appointmentId && payload.appointmentId !== appointmentId) return;
      // Only update if this is a meaningful change (different estimated time)
      setLive((prev) => {
        if (
          prev &&
          prev.estimatedConsultationStartTime === payload.estimatedConsultationStartTime &&
          prev.estimatedConsultationEndTime === payload.estimatedConsultationEndTime &&
          prev.queuePosition === payload.queuePosition &&
          prev.queueEntriesAhead === payload.queueEntriesAhead &&
          prev.currentServingTokenNumber === payload.currentServingTokenNumber &&
          prev.currentServingStatus === payload.currentServingStatus &&
          prev.currentTokenNumber === payload.currentTokenNumber &&
          prev.averageConsultationMinutes === payload.averageConsultationMinutes &&
          prev.status === payload.status &&
          prev.estimateStatus === payload.estimateStatus &&
          prev.queueStatus === payload.queueStatus
        ) {
          return prev;
        }
        return {
          ...prev,
          ...payload,
          called: payload.estimateStatus === 'called',
        };
      });
    };

    const handleCalled = (payload) => {
      if (payload?.appointmentId && payload.appointmentId !== appointmentId) return;
      setLive((prev) => ({
        ...prev,
        ...payload,
        estimateStatus: 'called',
        estimatedConsultationStartTime: null,
        estimatedConsultationEndTime: null,
        called: true,
      }));
    };

    socket.on(SOCKET_EVENTS.PATIENT_ETA_UPDATED, handleEtaUpdated);
    socket.on(SOCKET_EVENTS.PATIENT_CALLED, handleCalled);

    return () => {
      socket.off(SOCKET_EVENTS.PATIENT_ETA_UPDATED, handleEtaUpdated);
      socket.off(SOCKET_EVENTS.PATIENT_CALLED, handleCalled);
    };
  }, [appointmentId]);

  return {
    ...live,
    currentTime,
    isTrackingLoading: isPending,
    isTrackingError: isError,
  };
};

export default useAppointmentTracking;
