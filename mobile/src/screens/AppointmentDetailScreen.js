import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';

import { invalidateDoctorLookupCache, patientApi } from '../services/patientApi';
import { connectSocket } from '../services/socketService';
import { colors } from '../theme';
import {
  createAppointmentReceiptHtml,
  createAppointmentShareMessage,
} from '../utils/appointmentReceipt';
import {
  formatHospitalAddress,
  getEstimateText,
} from '../utils/dateTime';

const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'checked-in'];
const normalizeStatus = (status) => String(status || '').trim().toLowerCase().replace(/_/g, '-');

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function AppointmentDetailScreen({ route, navigation }) {
  const { appointmentId, appointment: initialAppointment, bookingConfirmed } = route.params;
  const [appointment, setAppointment] = useState(initialAppointment || null);
  const [detailLoadError, setDetailLoadError] = useState(false);
  const [queueEntry, setQueueEntry] = useState(null);
  const [loading, setLoading] = useState(!initialAppointment);
  const [cancelling, setCancelling] = useState(false);
  const [receiptAction, setReceiptAction] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [queueUpdatedAt, setQueueUpdatedAt] = useState(0);

  const loadDetails = useCallback(() => {
    if (initialAppointment) {
      setAppointment(initialAppointment);
      return;
    }

    patientApi
      .getAppointmentById(appointmentId)
      .then((response) => {
        setDetailLoadError(false);
        setAppointment(response.data.data?.appointment || null);
      })
      .catch((error) => {
        setDetailLoadError(true);
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('Appointment detail error:', error?.message || error);
        }
      })
      .finally(() => setLoading(false));
  }, [appointmentId, initialAppointment]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let socket;
      setCurrentTime(Date.now());
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
            console.warn('Queue estimate refresh error:', error?.message || error);
          }
        } finally {
          queueRequestInFlight = false;
        }
      };
      const handleEtaUpdate = (payload) => {
        if (String(payload?.appointmentId) !== String(appointmentId)) return;
        latestQueueUpdateAt = Date.now();
        setQueueEntry((prev) => ({ ...(prev || {}), ...payload }));
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
          socket.on('patient:eta-updated', handleEtaUpdate);
          socket.on('patient:called', handleEtaUpdate);
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
        socket?.off('patient:eta-updated', handleEtaUpdate);
        socket?.off('patient:called', handleEtaUpdate);
        socket?.off('connect', refreshQueueEntry);
      };
    }, [appointmentId])
  );

  const handleCancel = async () => {
    if (cancelling || !CANCELLABLE_STATUSES.includes(appointment?.status)) return;

    setCancelling(true);
    try {
      await patientApi.cancelAppointment(appointmentId, 'Patient cancelled from mobile app');
      invalidateDoctorLookupCache();
      setAppointment((current) => ({ ...current, status: 'cancelled' }));
      setQueueEntry((current) => ({
        ...(current || {}),
        status: 'skipped',
        estimateStatus: 'cancelled',
        queuePosition: null,
        estimatedConsultationStartTime: null,
        estimatedConsultationEndTime: null,
      }));
      Alert.alert('Cancelled', 'Your appointment was cancelled successfully.');
    } catch (error) {
      const message = error?.response?.data?.message || 'Unable to cancel this appointment right now.';
      Alert.alert('Cancellation failed', message);
    } finally {
      setCancelling(false);
    }
  };

  const confirmCancel = () => {
    if (!CANCELLABLE_STATUSES.includes(appointment?.status)) return;

    Alert.alert(
      'Cancel appointment?',
      'Are you sure you want to cancel this appointment? This action cannot be undone.',
      [
        { text: 'Keep appointment', style: 'cancel' },
        { text: 'Yes, cancel', style: 'destructive', onPress: handleCancel },
      ],
      { cancelable: true }
    );
  };

  const handlePrintReceipt = async () => {
    if (!appointment || receiptAction) return;
    setReceiptAction('print');
    try {
      await Print.printAsync({ html: createAppointmentReceiptHtml(appointment) });
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Print appointment receipt error:', error?.message || error);
      }
      Alert.alert('Unable to print receipt', 'Please try again.');
    } finally {
      setReceiptAction(null);
    }
  };

  const handleShareReceipt = async () => {
    if (!appointment || receiptAction) return;
    setReceiptAction('share');
    try {
      await Share.share({
        title: 'My UpcharGanga Appointment Receipt',
        message: createAppointmentShareMessage(appointment),
      });
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Share appointment receipt error:', error?.message || error);
      }
      Alert.alert('Unable to share receipt', 'Please try again.');
    } finally {
      setReceiptAction(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!appointment) {
    return (
      <View style={styles.centered}>
        <Text>
          {detailLoadError ? "Couldn't load appointment details." : 'Appointment not found.'}
        </Text>
        {detailLoadError && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setLoading(true);
              loadDetails();
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const appointmentStatus = normalizeStatus(appointment.status);
  const queueEstimateStatus = normalizeStatus(queueEntry?.estimateStatus);
  const queueIsFresh = queueUpdatedAt > 0 && currentTime - queueUpdatedAt <= 120000;
  const displayStatus = ['cancelled', 'expired'].includes(appointmentStatus)
    ? appointmentStatus
    : queueIsFresh
      ? queueEstimateStatus || appointmentStatus
      : appointmentStatus;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {bookingConfirmed && (
        <View style={styles.confirmationCard}>
          <Text style={styles.confirmationTitle}>Appointment confirmed</Text>
          <Text style={styles.confirmationText}>
            Your booking is complete. Save or share this receipt for your visit.
          </Text>
        </View>
      )}
      <Text style={styles.header}>{bookingConfirmed ? 'Your booking token' : 'Appointment details'}</Text>

      <View style={styles.tokenCard}>
        <Text style={styles.tokenLabel}>TOKEN NUMBER</Text>
        <Text style={styles.tokenNumber}>#{appointment.tokenNumber ?? 'N/A'}</Text>
        <Text style={styles.tokenReference}>
          Booking reference: {appointment.bookingNumber || 'N/A'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Doctor</Text>
        <Text style={styles.value}>Dr. {appointment.doctor?.user?.fullName || 'Doctor'}</Text>

        <Text style={styles.label}>Hospital</Text>
        <Text style={styles.value}>{appointment.hospital?.name || 'Hospital'}</Text>
        {!!formatHospitalAddress(appointment.hospital) && (
          <Text style={styles.address}>{formatHospitalAddress(appointment.hospital)}</Text>
        )}
        {!!appointment.hospital?.contact?.phone && (
          <Text style={styles.address}>Phone: {appointment.hospital.contact.phone}</Text>
        )}

        <Text style={styles.label}>Date</Text>
        <Text style={styles.value}>{formatDate(appointment.appointmentDate)}</Text>

        <Text style={styles.label}>Booked time</Text>
        <Text style={styles.value}>{appointment.timeSlot?.start || 'N/A'} - {appointment.timeSlot?.end || 'N/A'}</Text>

        <Text style={styles.label}>Token number</Text>
        <Text style={styles.value}>#{appointment.tokenNumber ?? 'N/A'}</Text>

        <Text style={styles.label}>Queue status</Text>
        <Text
          style={[
            styles.value,
            displayStatus === 'cancelled' && styles.cancelledStatus,
            displayStatus === 'expired' && styles.expiredStatus,
          ]}
        >
          {displayStatus === 'cancelled'
            ? 'Cancelled'
            : displayStatus === 'expired'
              ? 'Expired'
              : displayStatus.replace(/-/g, ' ')}
        </Text>

        <Text style={styles.label}>Estimated consultation time</Text>
        <Text style={styles.value}>
          {queueIsFresh ? getEstimateText(queueEntry, currentTime) : 'Refreshing queue estimate…'}
        </Text>

        <Text style={styles.label}>Queue position</Text>
        <Text style={styles.value}>
          {queueIsFresh ? queueEntry?.queuePosition ?? 'Not started' : 'Updating…'}
        </Text>

        <Text style={styles.label}>Booking reference</Text>
        <Text style={styles.value}>{appointment.bookingNumber || 'N/A'}</Text>
      </View>

      <View style={styles.receiptActions}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={receiptAction !== null}
          style={[styles.receiptButton, receiptAction !== null && styles.buttonDisabled]}
          onPress={handlePrintReceipt}
        >
          <Text style={styles.receiptButtonText}>
            {receiptAction === 'print' ? 'Opening print...' : 'Print receipt'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={receiptAction !== null}
          style={[styles.receiptButton, styles.shareButton, receiptAction !== null && styles.buttonDisabled]}
          onPress={handleShareReceipt}
        >
          <Text style={styles.shareButtonText}>
            {receiptAction === 'share' ? 'Opening share...' : 'Share receipt'}
          </Text>
        </TouchableOpacity>
      </View>

      {CANCELLABLE_STATUSES.includes(appointment.status) && (
        <View style={styles.cancelSection}>
          <Text style={styles.cancelHint}>
            Cancelling will release your appointment slot. You’ll be asked to confirm before it is cancelled.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: cancelling }}
            disabled={cancelling}
            style={[styles.cancelButton, cancelling && styles.cancelButtonDisabled]}
            onPress={confirmCancel}
          >
            {cancelling ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.cancelText}>Cancel appointment</Text>
            )}
          </TouchableOpacity>
        </View>
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
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
  },
  retryText: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  confirmationCard: {
    backgroundColor: colors.brandLight,
    borderColor: colors.brandBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 15,
    marginBottom: 16,
  },
  confirmationTitle: {
    color: colors.brandDark,
    fontSize: 17,
    fontWeight: '800',
  },
  confirmationText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  tokenCard: {
    backgroundColor: colors.brandLight,
    borderColor: colors.brandBorder,
    borderWidth: 2,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  tokenLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  tokenNumber: {
    color: colors.brandDark,
    fontSize: 42,
    fontWeight: '900',
    marginVertical: 3,
  },
  tokenReference: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 10,
  },
  value: {
    fontSize: 16,
    color: colors.text,
    marginTop: 4,
  },
  receiptActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  receiptButton: {
    minHeight: 46,
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  receiptButtonText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  shareButton: {
    backgroundColor: colors.surface,
  },
  shareButtonText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelledStatus: {
    color: colors.danger,
    fontWeight: '700',
  },
  expiredStatus: {
    color: '#111827',
    fontWeight: '700',
  },
  address: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    marginTop: 4,
  },
  cancelSection: {
    marginTop: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 14,
  },
  cancelHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  cancelButton: {
    backgroundColor: colors.danger,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonDisabled: {
    opacity: 0.65,
  },
  cancelText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
