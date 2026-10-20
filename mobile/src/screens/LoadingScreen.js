import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme';

export default function LoadingScreen({ error, onRetry }) {
  return (
    <View style={styles.container}>
      {error ? (
        <>
          <Text style={styles.errorTitle}>Can't connect right now</Text>
          <Text style={styles.subtitle}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={onRetry}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </>
      ) : (
        <ActivityIndicator size="large" color={colors.brand} />
      )}
      <Text style={styles.title}>UpcharGanga</Text>
      {!error && <Text style={styles.subtitle}>Preparing your care journey...</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandLight,
    padding: 24,
  },
  title: {
    marginTop: 18,
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 18,
  },
  retryText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
});
