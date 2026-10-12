import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../../services/apiClient';
import { getApiErrorMessage } from '../../../utils/apiError';

/**
 * Hook to manage doctor unavailability API calls
 */

const doctorUnavailabilityApi = {
  getUnavailability: (doctorId) =>
    apiClient.get(`/doctors/${doctorId}/unavailability`),

  createUnavailability: (doctorId, data) =>
    apiClient.post(`/doctors/${doctorId}/unavailability`, data),

  updateUnavailability: (doctorId, unavailabilityId, data) =>
    apiClient.patch(`/doctors/${doctorId}/unavailability/${unavailabilityId}`, data),

  deleteUnavailability: (doctorId, unavailabilityId) =>
    apiClient.delete(`/doctors/${doctorId}/unavailability/${unavailabilityId}`),
};

/**
 * Get unavailability periods for a doctor
 */
export const useGetUnavailability = (doctorId) => {
  return useQuery({
    queryKey: ['doctorUnavailability', doctorId],
    queryFn: () => doctorUnavailabilityApi.getUnavailability(doctorId),
    enabled: !!doctorId,
  });
};

/**
 * Create new unavailability period
 */
export const useCreateUnavailability = (doctorId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => {
      // Convert date strings to ISO format for API
      const payload = {
        ...data,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
      };
      return doctorUnavailabilityApi.createUnavailability(doctorId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctorUnavailability', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['adminDoctors'] });
    },
    onError: (error) => {
      console.error('❌ Failed to create unavailability:', getApiErrorMessage(error));
    },
  });
};

/**
 * Update unavailability period
 */
export const useUpdateUnavailability = (doctorId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ unavailabilityId, data }) => {
      // Convert date strings to ISO format for API
      const payload = {
        ...data,
      };
      if (data.startDate) {
        payload.startDate = new Date(data.startDate).toISOString();
      }
      if (data.endDate) {
        payload.endDate = new Date(data.endDate).toISOString();
      }
      return doctorUnavailabilityApi.updateUnavailability(doctorId, unavailabilityId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctorUnavailability', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['adminDoctors'] });
    },
    onError: (error) => {
      console.error('❌ Failed to update unavailability:', getApiErrorMessage(error));
    },
  });
};

/**
 * Delete unavailability period
 */
export const useDeleteUnavailability = (doctorId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (unavailabilityId) =>
      doctorUnavailabilityApi.deleteUnavailability(doctorId, unavailabilityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctorUnavailability', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['adminDoctors'] });
    },
    onError: (error) => {
      console.error('❌ Failed to delete unavailability:', getApiErrorMessage(error));
    },
  });
};
