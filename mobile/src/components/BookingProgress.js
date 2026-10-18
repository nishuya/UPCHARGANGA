import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

const STEPS = ['City', 'Hospital', 'Doctor', 'Confirm'];

export default function BookingProgress({ current }) {
  return (
    <View accessibilityLabel={`Booking step ${current} of 4`} style={styles.row}>
      {STEPS.map((step, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <React.Fragment key={step}>
            <View style={styles.step}>
              <View
                style={[
                  styles.circle,
                  active && styles.activeCircle,
                  done && styles.doneCircle,
                ]}
              >
                <Text style={[styles.number, active && styles.activeNumber, done && styles.doneNumber]}>
                  {done ? '✓' : number}
                </Text>
              </View>
              <Text
                style={[
                  styles.label,
                  active && styles.activeLabel,
                  number > current && styles.futureLabel,
                ]}
              >
                {step}
              </Text>
            </View>
            {index < STEPS.length - 1 && (
              <View style={[styles.connector, number < current && styles.completedConnector]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  step: {
    alignItems: 'center',
    minWidth: 48,
  },
  circle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 2,
  },
  activeCircle: {
    backgroundColor: colors.brandDark,
    borderColor: colors.brandDark,
  },
  doneCircle: {
    backgroundColor: colors.brandLight,
    borderColor: colors.brandLight,
  },
  number: {
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '600',
  },
  activeNumber: {
    color: colors.surface,
  },
  doneNumber: {
    color: colors.brandDark,
  },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 5,
  },
  activeLabel: {
    color: colors.brandDark,
    fontWeight: '700',
  },
  futureLabel: {
    color: colors.textSubtle,
  },
  connector: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 5,
    marginBottom: 16,
  },
  completedConnector: {
    backgroundColor: colors.brandBorder,
  },
});
