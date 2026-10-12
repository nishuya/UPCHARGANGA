import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../../services/apiClient';

/**
 * Hook for managing patient notifications
 * - Fetch unread/all notifications
 * - Mark notification as read
 * - Real-time updates via Socket.IO
 */

const notificationAPI = {
  getUnreadNotifications: (limit = 20) =>
    apiClient.get(`/notifications?limit=${limit}`),
  getAllNotifications: (limit = 50) =>
    apiClient.get(`/notifications/all?limit=${limit}`),
  markAsRead: (notificationId) =>
    apiClient.patch(`/notifications/${notificationId}/read`),
};

/**
 * Fetch unread notifications for current user
 */
export const useUnreadNotifications = (limit = 20) => {
  return useQuery({
    queryKey: ['notifications', 'unread', limit],
    queryFn: () => notificationAPI.getUnreadNotifications(limit),
    select: (response) => response.data?.data?.notifications || [],
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every 60 seconds
  });
};

/**
 * Fetch all notifications (read + unread) for current user
 */
export const useAllNotifications = (limit = 50) => {
  return useQuery({
    queryKey: ['notifications', 'all', limit],
    queryFn: () => notificationAPI.getAllNotifications(limit),
    select: (response) => response.data?.data?.notifications || [],
    staleTime: 30 * 1000,
  });
};

/**
 * Mark a notification as read
 */
export const useMarkNotificationAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId) => notificationAPI.markAsRead(notificationId),
    onSuccess: () => {
      // Invalidate both unread and all notifications queries
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => {
      console.error('❌ Failed to mark notification as read:', error);
    },
  });
};

export default {
  useUnreadNotifications,
  useAllNotifications,
  useMarkNotificationAsRead,
};
