import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { patientApi } from '../services/patientApi';
import { connectSocket } from '../services/socketService';
import { colors } from '../theme';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
];

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

export default function NotificationsScreen({ navigation, refreshUnreadCount }) {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const response = await patientApi.getAllNotifications();
      setNotifications(response.data.data?.notifications || []);
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Notifications error:', error?.message || error);
      }
      Alert.alert('Unable to load notifications', 'Please try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(true);
    }, [loadNotifications])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let socket;
      const refreshForNewNotification = () => {
        if (active) loadNotifications();
      };

      connectSocket()
        .then((connectedSocket) => {
          if (!active || !connectedSocket) return;
          socket = connectedSocket;
          socket.on('newNotification', refreshForNewNotification);
        })
        .catch((error) => {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.warn('Unable to connect to notification updates:', error?.message || error);
          }
        });

      return () => {
        active = false;
        socket?.off('newNotification', refreshForNewNotification);
      };
    }, [loadNotifications])
  );

  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        if (filter === 'unread') return !notification.isRead;
        if (filter === 'read') return notification.isRead;
        return true;
      }),
    [filter, notifications]
  );

  const markAsRead = async (notification) => {
    if (notification.isRead) return;
    try {
      await patientApi.markNotificationAsRead(notification._id);
      setNotifications((current) =>
        current.map((item) =>
          item._id === notification._id ? { ...item, isRead: true } : item
        )
      );
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Mark notification as read error:', error?.message || error);
      }
      Alert.alert('Unable to update notification', 'Please try again.');
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter((notification) => !notification.isRead);
    if (!unread.length) return;
    try {
      await Promise.all(unread.map((notification) =>
        patientApi.markNotificationAsRead(notification._id)
      ));
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Mark all notifications as read error:', error?.message || error);
      }
      Alert.alert('Unable to update notifications', 'Please try again.');
      loadNotifications();
    }
  };

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  useEffect(() => {
    refreshUnreadCount?.();
  }, [notifications, refreshUnreadCount]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>Appointment reminders and status updates.</Text>
      </View>

      <View style={styles.filters}>
        {FILTERS.map(({ id, label }) => (
          <TouchableOpacity
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === id }}
            style={[styles.filterButton, filter === id && styles.selectedFilter]}
            onPress={() => setFilter(id)}
          >
            <Text style={[styles.filterText, filter === id && styles.selectedFilterText]}>
              {label}{id === 'unread' ? ` (${unreadCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {unreadCount > 0 && (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.markAllButton}
          onPress={markAllAsRead}
        >
          <Text style={styles.markAllText}>Mark all as read</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.emptyText}>Loading notifications...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadNotifications();
              }}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {filter === 'unread' ? 'All caught up!' : 'No notifications'}
              </Text>
              <Text style={styles.emptyText}>
                {filter === 'unread'
                  ? "You don't have any unread notifications."
                  : 'Notifications will appear here when something changes.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, !item.isRead && styles.unreadCard]}>
              <View style={styles.cardHeading}>
                <Text style={styles.notificationTitle}>{item.title}</Text>
                {!item.isRead && <View style={styles.unreadDot} />}
              </View>
              <Text style={styles.message}>{item.message}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.date}>{formatDateTime(item.createdAt)}</Text>
                {!item.isRead && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => markAsRead(item)}
                  >
                    <Text style={styles.markReadText}>Mark as read</Text>
                  </TouchableOpacity>
                )}
              </View>
              {item.relatedAppointment && (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.appointmentLink}
                  onPress={async () => {
                    await markAsRead(item);
                    const appointmentId =
                      item.relatedAppointment._id || item.relatedAppointment;
                    navigation.navigate('AppointmentDetail', { appointmentId });
                  }}
                >
                  <Text style={styles.appointmentLinkText}>View appointment →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 5,
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginRight: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  selectedFilter: {
    borderBottomColor: colors.brand,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  selectedFilterText: {
    color: colors.brandDark,
  },
  markAllButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  markAllText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  unreadCard: {
    backgroundColor: colors.brandLight,
    borderColor: colors.brandBorder,
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  notificationTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.brand,
    marginTop: 5,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  date: {
    color: colors.textSubtle,
    fontSize: 11,
    flex: 1,
  },
  markReadText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '700',
  },
  appointmentLink: {
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  appointmentLinkText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
    textAlign: 'center',
  },
});
