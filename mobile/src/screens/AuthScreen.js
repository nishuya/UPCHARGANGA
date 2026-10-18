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

const getAuthenticationErrorMessage = (error) => {
  const status = error?.response?.status;
  const responseData = error?.response?.data;

  if (status === 400 && Array.isArray(responseData?.errors) && responseData.errors.length > 0) {
    return responseData.errors
      .filter((message) => typeof message === 'string')
      .join('\n');
  }

  if (status === 400 && responseData?.message === 'Validation failed') {
    return 'Please check the information you entered and try again.';
  }

  if (status === 401) return 'Email or password is incorrect.';
  if (status === 403) return 'This account cannot log in. Please contact support if you need help.';
  if (status === 409) {
    return responseData?.message || 'An account with these details already exists.';
  }
  if (status === 423) {
    return 'Your account is temporarily locked. Please wait before trying again.';
  }
  if (status === 429) return 'Too many attempts. Please wait and try again.';
  if (status === 404) {
    return 'The authentication service could not be found. Please update the app or contact support.';
  }
  if (status >= 500) {
    return 'The authentication service is temporarily unavailable. Please try again later.';
  }
  if (status) return 'Unable to authenticate with the information provided. Please try again.';
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return 'The request timed out. Check your connection and try again.';
  }
  if (error?.request) {
    return 'Unable to connect to UpcharGanga. Check your internet connection and try again.';
  }
  return 'Unable to complete the request. Please try again.';
};

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { signIn, signUp } = useAuth();

  const handleSubmit = async () => {
    if (!isLogin && password.length < 6) {
      Alert.alert('Invalid password', 'Password must be at least 6 characters long.');
      return;
    }
    if (!isLogin && password.length > 12) {
      Alert.alert('Invalid password', 'Password must be no more than 12 characters long.');
      return;
    }

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
      Alert.alert(isLogin ? 'Login failed' : 'Registration failed', getAuthenticationErrorMessage(error));
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
          {!isLogin && (
            <Text style={styles.passwordHint}>Use 6–12 characters. Any characters are allowed.</Text>
          )}

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
  passwordHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: -8,
    marginBottom: 14,
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
