import React, { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { invalidateDoctorLookupCache, patientApi } from '../services/patientApi';
import BookingProgress from '../components/BookingProgress';
import { colors } from '../theme';

const normalizeDateValue = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toISOString().slice(0, 10);
};

const isValidDateValue = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  return (
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day
  );
};

export default function BookingScreen({ route, navigation }) {
  const { doctor, hospital, city, departmentId } = route.params;
  const [appointmentDate, setAppointmentDate] = useState(normalizeDateValue(new Date().toISOString()));
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const bookingInProgress = useRef(false);
  const reasonInput = useRef(null);

  const handleBooking = async () => {
    if (bookingInProgress.current) return;
    if (!isValidDateValue(appointmentDate)) {
      Alert.alert('Invalid date', 'Enter the appointment date in YYYY-MM-DD format.');
      return;
    }

    bookingInProgress.current = true;
    setSubmitting(true);
    try {
      const payload = {
        hospital: hospital._id,
        department: departmentId,
        doctor: doctor._id,
        appointmentDate,
        reasonForVisit,
        symptoms: symptoms
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      };

      const response = await patientApi.bookAppointment(payload);
      const result = response.data.data;
      invalidateDoctorLookupCache();

      navigation.navigate('AppointmentDetail', {
        appointmentId: result.appointment._id,
        appointment: result.appointment,
        bookingConfirmed: true,
      });
    } catch (error) {
      const message = error?.response?.data?.message || 'Booking failed. Please try again.';
      Alert.alert('Booking failed', message);
    } finally {
      bookingInProgress.current = false;
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      <BookingProgress current={4} />
      <Text style={styles.header}>Confirm your appointment</Text>
      <Text style={styles.subheader}>
        Select your preferred date and provide any additional information.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>DOCTOR</Text>
        <Text style={styles.value}>Dr. {doctor.user?.fullName || 'Doctor'}</Text>

        <Text style={styles.label}>HOSPITAL</Text>
        <Text style={styles.value}>{hospital.name || 'Hospital'}</Text>

        <Text style={styles.label}>CITY</Text>
        <Text style={styles.value}>{city.name || 'City'}</Text>
      </View>

      <Text style={styles.label}>APPOINTMENT DATE</Text>
      <TextInput
        style={styles.input}
        value={appointmentDate}
        onChangeText={setAppointmentDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textSubtle}
        accessibilityLabel="Appointment date, year month day"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        returnKeyType="next"
        onSubmitEditing={() => reasonInput.current?.focus()}
      />

      <Text style={styles.label}>REASON FOR VISIT</Text>
      <TextInput
        ref={reasonInput}
        style={[styles.input, styles.textArea]}
        value={reasonForVisit}
        onChangeText={setReasonForVisit}
        placeholder="Describe your concern"
        placeholderTextColor={colors.textSubtle}
        multiline
      />

      <Text style={styles.label}>SYMPTOMS (COMMA SEPARATED)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={symptoms}
        onChangeText={setSymptoms}
        placeholder="Fever, cough, fatigue"
        placeholderTextColor={colors.textSubtle}
        multiline
      />

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleBooking}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>{submitting ? 'Booking...' : 'Book appointment'}</Text>
      </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  header: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  subheader: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.7,
    color: colors.textMuted,
    marginBottom: 8,
  },
  value: {
    fontSize: 15,
    color: colors.text,
    marginBottom: 10,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    color: colors.text,
    fontSize: 14,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: colors.brand,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
