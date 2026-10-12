import { useQuery } from '@tanstack/react-query';
import { getQueue } from '../services/doctorAssistant.api';

/**
 * The queue board's single source of truth. `refetchInterval` is the
 * reliable half of Live Updates here — the same reasoning as Reception's
 * useTodaysAppointments: Socket.IO (see useQueueLiveUpdates) triggers an
 * immediate refetch on top of this interval rather than trying to patch
 * state itself from a partial QUEUE_UPDATED payload (it only carries
 * doctor-wide counters, not per-entry detail) — either path lands here.
 */
export const useQueue = ({ doctor, date }) =>
  useQuery({
    queryKey: ['doctorQueue', doctor, date],
    queryFn: () => getQueue({ doctor, date }),
    select: (res) => res.data.data,
    enabled: !!doctor && !!date,
    refetchInterval: 10000, // Reduced from 15s to 10s for faster updates
    refetchOnWindowFocus: true,
    staleTime: 5000, // Data is stale after 5 seconds
    gcTime: 60000, // Keep unused data for 60 seconds
  });
