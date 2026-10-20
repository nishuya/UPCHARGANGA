import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  clearTokens,
  extractRefreshTokenFromHeaders,
  getCachedUser,
  getStoredAccessToken,
  getStoredRefreshToken,
  saveCachedUser,
  saveTokens,
} from '../services/api';
import { patientApi } from '../services/patientApi';
import { disconnectSocket } from '../services/socketService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState(null);
  const sessionGeneration = useRef(0);

  const cacheUserProfile = async (profile) => {
    try {
      await saveCachedUser(profile);
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Unable to cache patient profile:', error?.message || error);
      }
    }
  };

  const loadSession = async () => {
    const requestGeneration = ++sessionGeneration.current;
    let cachedUser = null;
    setSessionError(null);
    setIsLoading(true);
    try {
      const accessToken = await getStoredAccessToken();
      if (!accessToken) {
        setUser(null);
        return;
      }

      cachedUser = await getCachedUser();
      if (cachedUser) {
        if (requestGeneration !== sessionGeneration.current) return;
        setUser(cachedUser);
        setIsLoading(false);
      }

      const response = await patientApi.me();
      if (requestGeneration !== sessionGeneration.current) return;
      const restoredUser = response.data.data?.user;
      if (!restoredUser) {
        throw new Error('The session response did not include a user.');
      }
      setUser(restoredUser);
      await cacheUserProfile(restoredUser);
    } catch (error) {
      if (requestGeneration !== sessionGeneration.current) return;
      if ([401, 403].includes(error?.response?.status)) {
        setUser(null);
        await clearTokens();
      } else if (!cachedUser) {
        setUser(null);
        setSessionError('Unable to restore your session. Check your connection and try again.');
      }
    } finally {
      if (requestGeneration === sessionGeneration.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  const persistAuthSession = async (authResponse) => {
    const payload = authResponse?.data?.data;
    if (!payload) return;

    await saveTokens({
      accessToken: payload.accessToken,
      refreshToken: extractRefreshTokenFromHeaders(authResponse?.headers),
    });

    await cacheUserProfile(payload.user);
    setSessionError(null);
    setUser(payload.user);
  };

  const signIn = async (payload) => {
    sessionGeneration.current += 1;
    const response = await patientApi.login(payload);
    await persistAuthSession(response);
    return response.data.data;
  };

  const signUp = async (payload) => {
    sessionGeneration.current += 1;
    const response = await patientApi.register(payload);
    await persistAuthSession(response);
    return response.data.data;
  };

  const signOut = async () => {
    sessionGeneration.current += 1;
    const logoutRequest = getStoredRefreshToken()
      .then((refreshToken) => patientApi.logout(refreshToken))
      .catch((error) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('Logout request failed:', error?.message || error);
        }
      });
    disconnectSocket();
    setUser(null);
    await clearTokens();
    await logoutRequest;
  };

  const value = useMemo(
    () => ({
      user,
      setUser,
      isLoading,
      sessionError,
      signIn,
      signUp,
      signOut,
      loadSession,
    }),
    [user, isLoading, sessionError]
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
