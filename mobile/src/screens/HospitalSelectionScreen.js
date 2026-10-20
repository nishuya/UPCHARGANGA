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

const TYPE_LABELS = {
  government: 'Government',
  private: 'Private',
  clinic: 'Clinic',
};

export default function HospitalSelectionScreen({ route, navigation }) {
  const { city } = route.params;
  const [hospitals, setHospitals] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadHospitals = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await patientApi.getHospitals({ city: city._id });
      setHospitals(response.data.data?.hospitals || []);
    } catch (requestError) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Hospital load error:', requestError?.message || requestError);
      }
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [city._id]);

  useEffect(() => {
    loadHospitals();
  }, [loadHospitals]);

  const filteredHospitals = useMemo(
    () => hospitals.filter((hospital) => hospital.name?.toLowerCase().includes(search.trim().toLowerCase())),
    [hospitals, search]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredHospitals}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <>
            <BookingProgress current={2} />
            <Text style={styles.header}>Hospitals in {city.name || 'your city'}</Text>
            <Text style={styles.subheader}>
              Select the hospital you&apos;d like to visit for your appointment.
            </Text>
            <Text style={styles.fieldLabel}>SEARCH HOSPITAL</Text>
            <TextInput
              accessibilityLabel="Search hospital"
              style={styles.input}
              placeholder="e.g., City Care Hospital, Apollo"
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
              <Text style={styles.stateText}>Loading hospitals…</Text>
            </View>
          ) : error ? (
            <View style={styles.state}>
              <Text style={styles.stateText}>Couldn't load hospitals right now. Please try again.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={loadHospitals}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.state}>
              <Text style={styles.stateTitle}>No hospitals found</Text>
              <Text style={styles.stateText}>
                {search ? `No hospitals match "${search}". Try a different search term or city.` : 'No hospitals available in this city right now.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.card}
            onPress={() => navigation.navigate('Doctors', { hospital: item, city })}
          >
            {item.image?.url ? (
              <Image source={{ uri: item.image.url }} style={styles.hospitalImage} />
            ) : (
              <View style={[styles.hospitalImage, styles.imageFallback]}>
                <Text style={styles.hospitalEmoji}>🏥</Text>
                <Text style={styles.fallbackLabel}>
                  {TYPE_LABELS[item.type] || item.type || 'Hospital'}
                </Text>
              </View>
            )}
            <View style={styles.titleRow}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.badge}>{TYPE_LABELS[item.type] || item.type || 'Hospital'}</Text>
            </View>
            {!!item.address?.line1 && (
              <Text style={styles.meta}>📍 {item.address.line1}{item.address.pincode ? `, ${item.address.pincode}` : ''}</Text>
            )}
            <Text style={styles.cityMeta}>{item.city?.name || city.name}</Text>
            {(item.contact?.phone || item.averageRating || item.bedsCount) && (
              <View style={styles.footer}>
                {!!item.contact?.phone && <Text style={styles.footerText}>📞 {item.contact.phone}</Text>}
                {!!item.averageRating && <Text style={styles.footerText}>⭐ {item.averageRating.toFixed(1)} ({item.ratingCount || 0} reviews)</Text>}
                {!!item.bedsCount && <Text style={styles.footerText}>🛏️ {item.bedsCount} beds</Text>}
              </View>
            )}
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back to city selection</Text>
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
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  hospitalImage: { height: 150, width: '100%', borderRadius: 7, marginBottom: 12 },
  imageFallback: { backgroundColor: '#8b5cf6', alignItems: 'center', justifyContent: 'center' },
  hospitalEmoji: { fontSize: 48 },
  fallbackLabel: { color: '#FFFFFF', marginTop: 5, fontSize: 13 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  badge: {
    color: colors.brandDark,
    backgroundColor: colors.brandLight,
    borderColor: colors.brandBorder,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '600',
  },
  meta: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 9 },
  cityMeta: { color: colors.textSubtle, fontSize: 12, marginTop: 5 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 10, gap: 5 },
  footerText: { color: colors.textMuted, fontSize: 12, fontWeight: '500' },
  backLink: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, marginTop: 2 },
  backText: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  state: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    gap: 9,
  },
  stateTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  stateText: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retryText: { color: colors.brandDark, fontSize: 14, fontWeight: '700', marginTop: 6 },
});
