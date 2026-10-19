import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { patientApi } from '../services/patientApi';
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

  const upcoming = appointments.filter((appointment) =>
    UPCOMING_STATUSES.includes(appointment.status)
  );
  const nextAppointment = upcoming[0];

  const loadHomeData = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await patientApi.getMyAppointments();
      setAppointments(response.data.data?.appointments || []);
    } catch (error) {
      console.log('Home screen load error', error?.response?.data || error.message);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadHomeData();
  }, [loadHomeData]);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  useEffect(() => {
    const appointmentId = nextAppointment?._id;
    if (!appointmentId) {
      setQueueEntry(null);
      return undefined;
    }

    let active = true;
    const refreshQueueEntry = async () => {
      try {
        const response = await patientApi.getQueueEntry(appointmentId);
        if (active) {
          setQueueEntry(response.data.data?.queueEntry || null);
          setCurrentTime(Date.now());
        }
      } catch (error) {
        console.log('Home estimate error:', error?.response?.data || error.message);
      }
    };

    refreshQueueEntry();
    const interval = setInterval(refreshQueueEntry, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [nextAppointment?._id]);

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
      ) : loadError ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Couldn't load your appointments right now.</Text>
          <TouchableOpacity onPress={loadHomeData}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : upcoming.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.sectionLabel}>YOUR NEXT APPOINTMENT</Text>
          <Text style={styles.emptyTitle}>No upcoming appointments</Text>
          <Text style={styles.emptyText}>
            Book your first appointment to get started. You'll receive a token number and can track
            your position in real-time.
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('BookTab')}
          >
            <Text style={styles.secondaryButtonText}>Book an appointment</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
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
                <Text style={styles.detailValue}>{getEstimateText(queueEntry, currentTime)}</Text>
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
