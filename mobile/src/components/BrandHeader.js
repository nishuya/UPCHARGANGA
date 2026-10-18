import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, logoUri } from '../theme';

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
    minWidth: 180,
  },
  logo: {
    width: 36,
    height: 36,
    marginRight: 9,
  },
  copy: {
    justifyContent: 'center',
  },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
});
