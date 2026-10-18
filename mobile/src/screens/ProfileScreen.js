import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      Alert.alert('Logout failed', 'Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Profile</Text>
      <Text style={styles.subtitle}>Your UpcharGanga account information.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Full name</Text>
        <Text style={styles.value}>{user?.fullName || 'Patient'}</Text>

        <View style={styles.divider} />
        <Text style={styles.label}>Email address</Text>
        <Text style={styles.value}>{user?.email || '—'}</Text>

        <View style={styles.divider} />
        <Text style={styles.label}>Phone</Text>
        <Text style={styles.value}>{user?.phone || '—'}</Text>

        <View style={styles.divider} />
        <Text style={styles.label}>Gender</Text>
        <Text style={styles.value}>
          {user?.gender ? `${user.gender[0].toUpperCase()}${user.gender.slice(1)}` : '—'}
        </Text>

        <View style={styles.divider} />
        <Text style={styles.label}>Date of birth</Text>
        <Text style={styles.value}>
          {user?.dateOfBirth
            ? new Date(user.dateOfBirth).toLocaleDateString(undefined, {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
            : '—'}
        </Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
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
    marginBottom: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
  },
  value: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
    marginTop: 5,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginVertical: 14,
  },
  logoutButton: {
    marginTop: 20,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 16,
  },
});
