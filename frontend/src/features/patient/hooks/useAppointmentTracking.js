import { useEffect, useState, useCallback } from 'react';
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
 * The patient sees their estimated consultation time slot and queue position.
 * Same-day estimates are refreshed periodically against the current hospital
 * time; no client-side countdown is displayed.
 */

/**
 * Fetch appointment's queue entry to get real-time estimated times
 */
const fetchAppointmentQueueEntry = async (appointmentId) => {
  const response = await apiClient.get(`/appointments/${appointmentId}/queue-entry`);
  return response.data.data.queueEntry;
};

const useAppointmentTracking = (appointmentId) => {
  const [live, setLive] = useState(null);

  // Initial fetch of queue entry for this appointment
  const { data: queueEntry } = useQuery({
    queryKey: ['appointmentQueueEntry', appointmentId],
    queryFn: () => fetchAppointmentQueueEntry(appointmentId),
    enabled: !!appointmentId,
    refetchInterval: 30000, // Refetch every 30 seconds as fallback
    staleTime: 10000, // Data is stale after 10 seconds
  });

  // Initialize live data from queue entry
  useEffect(() => {
    if (queueEntry) {
      setLive((prev) => ({
        ...prev,
        appointmentId,
        estimatedConsultationStartTime: queueEntry.estimatedConsultationStartTime,
        estimatedConsultationEndTime: queueEntry.estimatedConsultationEndTime,
        queuePosition: queueEntry.queuePosition,
        queueStatus: queueEntry.status,
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
        if (prev &&
            prev.estimatedConsultationStartTime === payload.estimatedConsultationStartTime &&
            prev.estimatedConsultationEndTime === payload.estimatedConsultationEndTime) {
          // No change in estimated time — skip update to avoid unnecessary re-renders
          return prev;
        }
        return { ...prev, ...payload };
      });
    };

    const handleCalled = (payload) => {
      if (payload?.appointmentId && payload.appointmentId !== appointmentId) return;
      setLive((prev) => ({ ...prev, ...payload, called: true }));
    };

    socket.on(SOCKET_EVENTS.PATIENT_ETA_UPDATED, handleEtaUpdated);
    socket.on(SOCKET_EVENTS.PATIENT_CALLED, handleCalled);

    return () => {
      socket.off(SOCKET_EVENTS.PATIENT_ETA_UPDATED, handleEtaUpdated);
      socket.off(SOCKET_EVENTS.PATIENT_CALLED, handleCalled);
    };
  }, [appointmentId]);

  return live;
};

export default useAppointmentTracking;
