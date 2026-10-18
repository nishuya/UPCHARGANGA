import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  clearTokens,
  extractRefreshTokenFromHeaders,
  getStoredAccessToken,
  saveTokens,
} from '../services/api';
import { patientApi } from '../services/patientApi';
import { connectSocket, disconnectSocket } from '../services/socketService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = async () => {
    try {
      const accessToken = await getStoredAccessToken();
      if (!accessToken) {
        setUser(null);
        return;
      }

      const response = await patientApi.me();
      setUser(response.data.data?.user || null);
    } catch (error) {
      setUser(null);
      await clearTokens();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (user) {
      connectSocket();
      return;
    }

    disconnectSocket();
  }, [user]);

  const persistAuthSession = async (authResponse) => {
    const payload = authResponse?.data?.data;
    if (!payload) return;

    await saveTokens({
      accessToken: payload.accessToken,
      refreshToken: extractRefreshTokenFromHeaders(authResponse?.headers),
    });

    setUser(payload.user);
  };

  const signIn = async (payload) => {
    const response = await patientApi.login(payload);
    await persistAuthSession(response);
    await connectSocket();
    return response.data.data;
  };

  const signUp = async (payload) => {
    const response = await patientApi.register(payload);
    await persistAuthSession(response);
    await connectSocket();
    return response.data.data;
  };

  const signOut = async () => {
    try {
      await patientApi.logout();
    } catch (error) {
      // Ignore logout failures; clearing local session is the safety net.
    }

    disconnectSocket();
    await clearTokens();
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      setUser,
      isLoading,
      signIn,
      signUp,
      signOut,
      loadSession,
    }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
