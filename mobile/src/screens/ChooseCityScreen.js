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

export default function ChooseCityScreen({ navigation }) {
  const [cities, setCities] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadCities = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await patientApi.getCities();
      setCities(response.data.data?.cities || []);
    } catch (requestError) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('City load error:', requestError?.message || requestError);
      }
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  const filteredCities = useMemo(
    () => cities.filter((city) => city.name?.toLowerCase().includes(search.trim().toLowerCase())),
    [cities, search]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredCities}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <BookingProgress current={1} />
            <Text style={styles.header}>Where are you located?</Text>
            <Text style={styles.subheader}>
              Select your city to see available hospitals and doctors.
            </Text>
            <Text style={styles.fieldLabel}>SEARCH CITY</Text>
            <TextInput
              accessibilityLabel="Search city"
              style={styles.input}
              placeholder="e.g., Bengaluru, Mumbai, Delhi"
              placeholderTextColor={colors.textSubtle}
              value={search}
              onChangeText={setSearch}
            />
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.state}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.stateText}>Loading cities…</Text>
            </View>
          ) : error ? (
            <View style={styles.state}>
              <Text style={styles.stateText}>Couldn't load cities right now. Please try again.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={loadCities}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.state}>
              <Text style={styles.stateTitle}>No cities found</Text>
              <Text style={styles.stateText}>
                {search ? `No cities match "${search}". Try a different search term.` : 'Try searching for a city to get started.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.card}
            onPress={() => navigation.navigate('Hospitals', { city: item })}
          >
            {item.image?.url ? (
              <Image source={{ uri: item.image.url }} style={styles.cityImage} />
            ) : (
              <View style={styles.imageFallback}>
                <Text style={styles.cityEmoji}>🏙️</Text>
                <Text style={styles.imageCaption}>City</Text>
              </View>
            )}
            <Text style={styles.cityName}>{item.name}</Text>
            <Text style={styles.cityMeta}>
              {item.state}
              {item.country ? `, ${item.country}` : ''}
            </Text>
            {!!item.postalCodes?.length && (
              <Text style={styles.postalMeta}>
                📍 {item.postalCodes.length} postal code{item.postalCodes.length === 1 ? '' : 's'}
              </Text>
            )}
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
  list: {
    padding: 20,
    paddingBottom: 32,
    flexGrow: 1,
  },
  header: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  subheader: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
    marginBottom: 20,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
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
  cityImage: {
    height: 145,
    width: '100%',
    borderRadius: 7,
    marginBottom: 12,
  },
  imageFallback: {
    height: 145,
    borderRadius: 7,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#667eea',
  },
  cityEmoji: {
    fontSize: 42,
  },
  imageCaption: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  cityName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  cityMeta: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  postalMeta: {
    color: colors.textSubtle,
    fontSize: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  state: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 20,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    gap: 9,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  retryText: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
});
