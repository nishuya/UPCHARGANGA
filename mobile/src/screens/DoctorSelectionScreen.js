import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import BookingProgress from '../components/BookingProgress';
import { patientApi } from '../services/patientApi';
import { colors } from '../theme';

export default function DoctorSelectionScreen({ route, navigation }) {
  const { hospital, city } = route.params;
  const [doctors, setDoctors] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await patientApi.getDoctors({ hospital: hospital._id });
      setDoctors(response.data.data?.doctors || []);
    } catch (requestError) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Doctor load error:', requestError?.message || requestError);
      }
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [hospital._id]);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const filteredDoctors = useMemo(
    () =>
      doctors.filter((doctor) => {
        const query = search.trim().toLowerCase();
        return (
          !query ||
          doctor.user?.fullName?.toLowerCase().includes(query) ||
          doctor.specialization?.toLowerCase().includes(query)
        );
      }),
    [doctors, search]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredDoctors}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <>
            <BookingProgress current={3} />
            <Text style={styles.header}>Doctors at {hospital.name || 'this hospital'}</Text>
            <Text style={styles.subheader}>
              Choose a doctor to see their availability and book an appointment.
            </Text>
            <Text style={styles.fieldLabel}>SEARCH BY SPECIALIZATION</Text>
            <TextInput
              accessibilityLabel="Search by specialization"
              style={styles.input}
              placeholder="e.g., Cardiology, Pediatrics"
              placeholderTextColor={colors.textSubtle}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              autoCorrect={false}
            />
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.state}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.stateText}>Loading doctors…</Text>
            </View>
          ) : error ? (
            <View style={styles.state}>
              <Text style={styles.stateText}>Couldn't load doctors right now. Please try again.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={loadDoctors}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.state}>
              <Text style={styles.stateTitle}>No doctors found</Text>
              <Text style={styles.stateText}>
                {search ? 'Try adjusting your search term.' : 'No doctors available at this hospital right now.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const departmentId = item.department?._id || item.department;
          const available = item.isAvailableToday !== false;
          return (
            <View style={styles.card}>
              <View style={styles.doctorHead}>
                {item.image?.url ? (
                  <Image source={{ uri: item.image.url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarEmoji}>👨‍⚕️</Text>
                  </View>
                )}
                <View style={styles.doctorCopy}>
                  <Text style={styles.name}>Dr. {item.user?.fullName || 'Doctor'}</Text>
                  <Text style={styles.qualifications}>
                    {item.qualifications?.length ? item.qualifications.join(' • ') : 'MD • MBBS'}
                  </Text>
                  <Text style={styles.specialization}>{item.specialization || 'General care'}</Text>
                  <Text style={styles.stats}>
                    💼 {item.experienceYears || 0} yrs　•　💰 ₹{item.consultationFee}
                  </Text>
                  <Text style={[styles.availability, available ? styles.available : styles.unavailable]}>
                    {available ? '●  Available today' : '●  Unavailable today'}
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              <Text style={styles.meta}>🏥 {hospital.name}</Text>
              {!!item.department?.name && <Text style={styles.meta}>{item.department.name}</Text>}
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!available}
                style={[styles.bookButton, !available && styles.disabledButton]}
                onPress={() =>
                  navigation.navigate('Booking', {
                    doctor: item,
                    hospital,
                    city,
                    departmentId,
                  })
                }
              >
                <Text style={styles.bookButtonText}>Book Appointment</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListFooterComponent={
          <TouchableOpacity style={styles.backLink} onPress={() => navigation.navigate('BookTab')}>
            <Text style={styles.backText}>← Start over</Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 20, paddingBottom: 30, flexGrow: 1 },
  header: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: '700' },
  subheader: { color: colors.textMuted, fontSize: 14, lineHeight: 22, marginTop: 6, marginBottom: 20 },
  fieldLabel: { color: colors.text, fontSize: 11, fontWeight: '600', letterSpacing: 0.7, marginBottom: 8 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderColor: colors.brandBorder,
    borderWidth: 1,
    borderRadius: 6,
    minHeight: 46,
    paddingHorizontal: 13,
    fontSize: 14,
    marginBottom: 18,
  },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 15, marginBottom: 14 },
  doctorHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  avatar: { width: 70, height: 70, borderRadius: 14 },
  avatarFallback: { backgroundColor: '#667eea', justifyContent: 'center', alignItems: 'center' },
  avatarEmoji: { fontSize: 35 },
  doctorCopy: { flex: 1 },
  name: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  qualifications: { color: colors.textSubtle, fontSize: 11, marginTop: 3 },
  specialization: { color: colors.brandDark, fontSize: 13, fontWeight: '600', marginTop: 7 },
  stats: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
  availability: { fontSize: 11, fontWeight: '600', marginTop: 8 },
  available: { color: colors.success },
  unavailable: { color: colors.danger },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 13 },
  meta: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  bookButton: { backgroundColor: colors.brand, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  disabledButton: { opacity: 0.55 },
  bookButtonText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  backLink: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, marginTop: 2 },
  backText: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  state: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 20, alignItems: 'center', gap: 9 },
  stateTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  stateText: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retryText: { color: colors.brandDark, fontSize: 14, fontWeight: '700', marginTop: 6 },
});
