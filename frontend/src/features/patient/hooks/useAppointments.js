import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bookAppointment,
  getMyAppointments,
  getMyAppointmentById,
  cancelMyAppointment,
} from '../services/patient.api';

/** "My Appointments" / Track Appointment list — refetches on window focus
 * so a patient tabbing back in sees a status that may have changed while
 * they were away (e.g. reception checked them in). */
export const useMyAppointments = (filters = {}) =>
  useQuery({
    queryKey: ['myAppointments', filters],
    queryFn: () => getMyAppointments(filters),
    select: (res) => res.data.data.appointments,
    refetchOnWindowFocus: true,
  });

/** Single appointment — the source of truth for the Track page between
 * socket events (see useAppointmentTracking), and the fallback used by
 * Booking Success if the page is reloaded and navigation state is lost. */
export const useAppointment = (id) =>
  useQuery({
    queryKey: ['appointment', id],
    queryFn: () => getMyAppointmentById(id),
    select: (res) => res.data.data.appointment,
    enabled: !!id,
  });

export const useBookAppointment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => {
      // Before booking, ensure doctor availability data is fresh
      // This prevents "fully booked" errors when doctor updated their schedule
      if (import.meta.env.DEV) {
        console.log('📋 Booking with payload:', payload);
      }
      queryClient.invalidateQueries({ queryKey: ['doctor', payload.doctor] });
      // Also invalidate doctors list for the hospital
      queryClient.invalidateQueries({ queryKey: ['doctors', payload.hospital] });
      return bookAppointment(payload);
    },
    onSuccess: () => {
      // Any freshly-cached "my appointments" list is now stale.
      queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
    },
    onError: (error) => {
      if (import.meta.env.DEV) {
        console.error('❌ Booking error:', error);
      }
      // Log only safe error message in production, never response data
    },
  });
};

export const useCancelAppointment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cancellationReason }) => {
      if (import.meta.env.DEV) {
        console.log('🚫 API call - cancelling appointment:', id, 'reason:', cancellationReason);
      }
      return cancelMyAppointment(id, cancellationReason);
    },
    onSuccess: (_res, variables) => {
      if (import.meta.env.DEV) {
        console.log('✅ Cancellation succeeded:', _res);
        console.log('📊 Invalidating caches for appointment:', variables.id);
      }
      queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment', variables.id] });
      // Also invalidate queue data since this affects queue positions
      queryClient.invalidateQueries({ queryKey: ['doctorQueue'] });
    },
    onError: (error) => {
      if (import.meta.env.DEV) {
        console.error('❌ Cancellation mutation error:', error);
        console.error('📋 Error response:', error?.response?.data);
        console.error('📋 Error status:', error?.response?.status);
        console.error('📋 Error message:', error?.message);
      }
      // Never log sensitive error data in production
    },
  });
};
