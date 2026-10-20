import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { patientApi } from '../services/patientApi';
import { colors } from '../theme';

const formatDate = (value) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatStatus = (status) =>
  status ? status.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Unknown';

const normalizeStatus = (status) => String(status || '').trim().toLowerCase().replace(/_/g, '-');

export default function AppointmentsScreen({ navigation }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const latestRequest = useRef(0);

  const loadAppointments = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoadError(false);
    try {
      const response = await patientApi.getMyAppointments();
      if (requestId === latestRequest.current) {
        setAppointments(response.data.data?.appointments || []);
      }
    } catch (error) {
      if (requestId === latestRequest.current) {
        setLoadError(true);
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('Appointments error:', error?.message || error);
        }
      }
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadAppointments();
  }, [loadAppointments]);

  useFocusEffect(
    useCallback(() => {
      loadAppointments();
    }, [loadAppointments])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text>Loading appointments...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <Text style={styles.header}>My Appointments</Text>
        <Text style={styles.subtitle}>
          Track your bookings, queue positions, and appointment history.
        </Text>
        {loadError && appointments.length > 0 && (
          <Text style={styles.errorNotice}>
            Couldn't refresh appointments. Showing the last loaded information.
          </Text>
        )}
        <TouchableOpacity style={styles.bookButton} onPress={() => navigation.navigate('BookTab')}>
          <Text style={styles.bookButtonText}>+ Book new</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={appointments}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.brand]}
            tintColor={colors.brand}
          />
        }
        ListEmptyComponent={
          loadError ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Couldn't load appointments</Text>
              <Text style={styles.emptyText}>Check your connection and try again.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={loadAppointments}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No appointments yet</Text>
              <Text style={styles.emptyText}>
                You haven&apos;t booked any appointments yet. Start by booking your first appointment.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('AppointmentDetail', { appointmentId: item._id })}
          >
            <Text style={styles.doctorName}>Dr. {item.doctor?.user?.fullName || 'Doctor'}</Text>
            <Text style={styles.hospitalName}>{item.hospital?.name || 'Hospital'}</Text>
            <View style={styles.appointmentMeta}>
              <Text style={styles.token}>Token #{item.tokenNumber ?? 'N/A'}</Text>
              <Text style={styles.row}>
                {formatDate(item.appointmentDate)}
                {item.timeSlot?.start
                  ? ` · ${item.timeSlot.start}${item.timeSlot.end ? `–${item.timeSlot.end}` : ''}`
                  : ''}
              </Text>
            </View>
            <Text style={styles.reference}>Ref: {item.bookingNumber || '—'}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.track}>Track appointment →</Text>
              <Text
                style={[
                  styles.status,
                  normalizeStatus(item.status) === 'cancelled' && styles.cancelledStatus,
                  normalizeStatus(item.status) === 'expired' && styles.expiredStatus,
                ]}
              >
                {formatStatus(normalizeStatus(item.status))}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pageHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 5,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  errorNotice: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 8,
  },
  bookButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginTop: 14,
  },
  bookButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  doctorName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  hospitalName: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 14,
  },
  appointmentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 12,
  },
  token: {
    backgroundColor: colors.brandLight,
    borderColor: colors.brandBorder,
    borderWidth: 1,
    borderRadius: 7,
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  row: {
    color: colors.textMuted,
    fontSize: 13,
  },
  status: {
    color: colors.brandDark,
    backgroundColor: colors.brandLight,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontWeight: '600',
    fontSize: 11,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  cancelledStatus: {
    color: colors.danger,
    backgroundColor: '#FEF2F2',
  },
  expiredStatus: {
    color: '#111827',
    backgroundColor: '#E5E7EB',
  },
  reference: {
    marginTop: 9,
    color: colors.textSubtle,
    fontSize: 11,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 13,
    paddingTop: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  track: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    marginTop: 8,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retryText: {
    color: colors.brandDark,
    fontWeight: '700',
    marginTop: 12,
  },
});
