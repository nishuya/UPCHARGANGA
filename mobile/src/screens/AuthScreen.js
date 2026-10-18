import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { colors, logoUri } from '../theme';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { signIn, signUp } = useAuth();

  const handleSubmit = async () => {
    if (!email || !password || (!isLogin && (!fullName || !phone))) {
      Alert.alert('Missing details', 'Please complete the required fields before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      if (isLogin) {
        await signIn({ email, password });
      } else {
        await signUp({
          fullName,
          email,
          phone,
          password,
          role: 'patient',
        });
      }
    } catch (error) {
      const message = error?.response?.data?.message || 'Something went wrong. Please try again.';
      Alert.alert('Authentication failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.brandRow}>
            <Image source={{ uri: logoUri }} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={styles.brand}>UpcharGanga</Text>
              <Text style={styles.portal}>Patient Portal</Text>
            </View>
          </View>
          <Text style={styles.title}>{isLogin ? 'Welcome back' : 'Create patient account'}</Text>
          <Text style={styles.subtitle}>
            {isLogin
              ? 'Use your email and password to access your appointments and queue tracking.'
              : 'Register to book appointments with trusted hospitals.'}
          </Text>

          {!isLogin && (
            <>
              <Text style={styles.fieldLabel}>FULL NAME</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Full name"
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="words"
              />
            </>
          )}

          <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSubtle}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {!isLogin && (
            <>
              <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number"
                placeholderTextColor={colors.textSubtle}
                keyboardType="phone-pad"
              />
            </>
          )}

          <Text style={styles.fieldLabel}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
          />

          <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={submitting}>
            <Text style={styles.primaryButtonText}>
              {submitting ? 'Please wait…' : isLogin ? 'Log in to UpcharGanga' : 'Create account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsLogin((value) => !value)}>
            <Text style={styles.toggleText}>
              {isLogin ? "Don't have an account? Register" : 'Already have an account? Log in'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.secureNote}>
            ✓ Secure & trusted by leading hospitals
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.brandLight,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  logo: {
    width: 42,
    height: 42,
    marginRight: 10,
  },
  brand: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  portal: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 18,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.7,
    marginBottom: 7,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.brandBorder,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 14,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  toggleText: {
    textAlign: 'center',
    color: colors.brandDark,
    marginTop: 14,
    fontWeight: '600',
  },
  secureNote: {
    color: colors.textSubtle,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
