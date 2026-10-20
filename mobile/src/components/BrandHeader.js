import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, logoUri } from '../theme';

export function NotificationBell({ unreadCount = 0, onPress }) {
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : 'Notifications'
      }
      onPress={onPress}
      style={styles.bellButton}
      hitSlop={6}
    >
      <Ionicons name="notifications-outline" size={23} color={colors.text} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeLabel}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function BrandHeader() {
  return (
    <View style={styles.container}>
      <Image source={{ uri: logoUri }} style={styles.logo} resizeMode="contain" />
      <View style={styles.copy}>
        <Text style={styles.name}>UpcharGanga</Text>
        <Text style={styles.subtitle}>Patient Portal</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  logo: {
    width: 34,
    height: 34,
    marginRight: 8,
  },
  copy: {
    justifyContent: 'center',
    flexShrink: 1,
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  bellButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 1,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.surface,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
  },
});
