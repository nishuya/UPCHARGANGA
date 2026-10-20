import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { patientApi } from '../services/patientApi';
import { connectSocket } from '../services/socketService';
import { colors } from '../theme';
import { formatHospitalAddress, getEstimateText } from '../utils/dateTime';

const UPCOMING_STATUSES = ['pending', 'confirmed', 'checked-in', 'in-consultation'];

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [queueEntry, setQueueEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [queueUpdatedAt, setQueueUpdatedAt] = useState(0);
  const latestHomeRequest = useRef(0);
  const queueAppointmentId = useRef(null);

  const upcoming = appointments.filter((appointment) =>
    UPCOMING_STATUSES.includes(appointment.status)
  );
  const nextAppointment = upcoming[0];

  const loadHomeData = useCallback(async () => {
    const requestId = ++latestHomeRequest.current;
    setLoadError(false);
    try {
      const response = await patientApi.getMyAppointments();
      if (requestId === latestHomeRequest.current) {
        setAppointments(response.data.data?.appointments || []);
      }
    } catch (error) {
      if (requestId === latestHomeRequest.current) {
        setLoadError(true);
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('Home screen load error:', error?.message || error);
        }
      }
    } finally {
      if (requestId === latestHomeRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadHomeData();
  }, [loadHomeData]);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  useFocusEffect(
    useCallback(() => {
      const appointmentId = nextAppointment?._id;
      if (!appointmentId) {
        queueAppointmentId.current = null;
        setQueueEntry(null);
        setQueueUpdatedAt(0);
        return undefined;
      }
      setCurrentTime(Date.now());
      if (queueAppointmentId.current !== appointmentId) {
        queueAppointmentId.current = appointmentId;
        setQueueEntry(null);
        setQueueUpdatedAt(0);
      }

      let active = true;
      let socket;
      let latestQueueUpdateAt = 0;
      let queueRequestInFlight = false;
      const refreshQueueEntry = async () => {
        if (queueRequestInFlight) return;
        queueRequestInFlight = true;
        const requestStartedAt = Date.now();
        try {
          const response = await patientApi.getQueueEntry(appointmentId);
          if (active && requestStartedAt >= latestQueueUpdateAt) {
            const updatedAt = Date.now();
            setQueueEntry(response.data.data?.queueEntry || null);
            setQueueUpdatedAt(updatedAt);
            setCurrentTime(updatedAt);
          }
        } catch (error) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.warn('Home estimate error:', error?.message || error);
          }
        } finally {
          queueRequestInFlight = false;
        }
      };

      const handleQueueUpdate = (payload) => {
        if (String(payload?.appointmentId) !== String(appointmentId)) return;
        latestQueueUpdateAt = Date.now();
        setQueueEntry((current) => ({ ...(current || {}), ...payload }));
        setQueueUpdatedAt(latestQueueUpdateAt);
        setCurrentTime(latestQueueUpdateAt);
      };

      const fallbackInterval = setInterval(() => {
        setCurrentTime(Date.now());
        if (!socket?.connected) refreshQueueEntry();
      }, 60000);

      refreshQueueEntry();
      connectSocket()
        .then((connectedSocket) => {
          if (!active || !connectedSocket) return;
          socket = connectedSocket;
          socket.on('patient:eta-updated', handleQueueUpdate);
          socket.on('patient:called', handleQueueUpdate);
          socket.on('connect', refreshQueueEntry);
          if (socket.connected) refreshQueueEntry();
        })
        .catch((error) => {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.warn('Unable to connect to live queue updates:', error?.message || error);
          }
        });

      return () => {
        active = false;
        clearInterval(fallbackInterval);
        socket?.off('patient:eta-updated', handleQueueUpdate);
        socket?.off('patient:called', handleQueueUpdate);
        socket?.off('connect', refreshQueueEntry);
      };
    }, [nextAppointment?._id])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      alwaysBounceVertical
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[colors.brand]}
          tintColor={colors.brand}
        />
      }
    >
      <View style={styles.intro}>
        <Text style={styles.heading}>Hi {user?.fullName?.split(' ')[0] || 'Patient'},</Text>
        <Text style={styles.subheading}>Welcome to your UpcharGanga patient portal</Text>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        style={styles.primaryButton}
        onPress={() => navigation.navigate('BookTab')}
      >
        <Text style={styles.primaryButtonText}>+ Book a new appointment</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.stateText}>Loading your appointments…</Text>
        </View>
      ) : loadError && appointments.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Couldn't load your appointments right now.</Text>
          <TouchableOpacity onPress={loadHomeData}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : upcoming.length === 0 ? (
        <>
          {loadError && (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Couldn't refresh appointment status.</Text>
              <TouchableOpacity onPress={loadHomeData}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.emptyCard}>
            <Text style={styles.sectionLabel}>YOUR NEXT APPOINTMENT</Text>
            <Text style={styles.emptyTitle}>
              {loadError ? 'Appointment status unavailable' : 'No upcoming appointments'}
            </Text>
            <Text style={styles.emptyText}>
              {loadError
                ? 'We could not confirm your latest appointment status. Refresh to try again.'
                : "Book your first appointment to get started. You'll receive a token number and can track your position in real-time."}
            </Text>
            {!loadError && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('BookTab')}
              >
                <Text style={styles.secondaryButtonText}>Book an appointment</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        <>
          {loadError && (
            <View style={styles.stateCard}>
              <Text style={styles.stateText}>
                Couldn't refresh appointments. Showing the last loaded information.
              </Text>
              <TouchableOpacity onPress={loadHomeData}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.sectionLabel}>YOUR NEXT APPOINTMENT</Text>
          <View style={styles.featuredCard}>
            <Text style={styles.caption}>DOCTOR</Text>
            <Text style={styles.doctorName}>
              Dr. {nextAppointment.doctor?.user?.fullName || 'Doctor'}
            </Text>

            <View style={styles.details}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Hospital</Text>
                <Text style={styles.detailValue}>{nextAppointment.hospital?.name || 'Hospital'}</Text>
                {!!formatHospitalAddress(nextAppointment.hospital) && (
                  <Text style={styles.addressValue}>
                    {formatHospitalAddress(nextAppointment.hospital)}
                  </Text>
                )}
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Date & time</Text>
                <Text style={styles.detailValue}>
                  {formatDate(nextAppointment.appointmentDate)} · {nextAppointment.timeSlot?.start}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Estimated consultation</Text>
                <Text style={styles.detailValue}>
                  {queueUpdatedAt && currentTime - queueUpdatedAt <= 120000
                    ? getEstimateText(queueEntry, currentTime)
                    : 'Refreshing queue estimate…'}
                </Text>
              </View>
            </View>

            <View style={styles.tokenRow}>
              <Text style={styles.caption}>YOUR TOKEN</Text>
              <Text style={styles.token}>#{nextAppointment.tokenNumber}</Text>
            </View>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                navigation.navigate('AppointmentDetail', {
                  appointmentId: nextAppointment._id,
                })
              }
            >
              <Text style={styles.secondaryButtonText}>Track live status →</Text>
            </TouchableOpacity>
          </View>

          {upcoming.length > 1 && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={() => navigation.navigate('AppointmentsTab')}
            >
              <Text style={styles.viewAllText}>More appointments</Text>
              <Text style={styles.viewAllLink}>View all →</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  intro: {
    marginBottom: 18,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subheading: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
    marginTop: 5,
  },
  primaryButton: {
    minHeight: 48,
    backgroundColor: colors.brand,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.1,
    marginBottom: 10,
  },
  featuredCard: {
    backgroundColor: colors.brandLight,
    borderWidth: 2,
    borderColor: colors.brandBorder,
    borderRadius: 12,
    padding: 16,
  },
  caption: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  },
  doctorName: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
    marginTop: 4,
  },
  details: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.brandBorder,
    gap: 13,
  },
  detailRow: {
    gap: 3,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  addressValue: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  tokenRow: {
    borderTopWidth: 1,
    borderTopColor: colors.brandBorder,
    marginTop: 16,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  token: {
    color: colors.brandDark,
    fontSize: 34,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 8,
    borderColor: colors.brand,
    borderWidth: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginTop: 14,
  },
  secondaryButtonText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  stateCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  stateTitle: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 14,
  },
  retryText: {
    color: colors.brandDark,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  viewAllButton: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewAllText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  viewAllLink: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '600',
  },
});
