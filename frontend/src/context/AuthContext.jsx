import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from '../services/tokenStore';
import { queryClient } from '../services/queryClient';
import { connectSocket, disconnectSocket } from '../sockets/socketClient';
import { loginRequest, logoutRequest, refreshTokenRequest } from '../features/auth/services/auth.api';

const AuthContext = createContext(undefined);

/**
 * Owns client-side auth state: the current user (or null) and a loading flag
 * for the initial session bootstrap.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // true until bootstrap finishes
  const [initializationError, setInitializationError] = useState(null);

  const handleAuthenticated = useCallback((data) => {
    if (!data?.accessToken || !data?.user) {
      return false;
    }
    setAccessToken(data.accessToken);
    setUser(data.user);
    connectSocket();
    return true;
  }, []);

  const clearSession = useCallback(() => {
    clearAccessToken();
    setUser(null);
    disconnectSocket();
    queryClient.clear();
  }, []);

  const login = useCallback(
    async (credentials) => {
      const { data } = await loginRequest(credentials);
      if (!handleAuthenticated(data?.data)) {
        throw new Error('The login response did not contain a valid user session.');
      }
      return data.data.user;
    },
    [handleAuthenticated]
  );

  const logout = useCallback(async () => {
    // Capture current access token before clearing local state so the backend
    // can identify the user even if only the Authorization header or only the
    // refreshToken cookie is available.
    const tokenBeforeLogout = getAccessToken();

    // Immediately clear local auth state, in-memory token, socket, and query cache
    // so protected routes stop rendering authenticated content immediately.
    clearSession();

    try {
      await logoutRequest(tokenBeforeLogout);
      return { revokedOnServer: true };
    } catch (error) {
      console.warn(
        'Server logout request failed; local session was cleared immediately:',
        error.message
      );
      return { revokedOnServer: false, error };
    }
  }, [clearSession]);

  const restoreSession = useCallback(async (isCurrent = () => true) => {
    setIsLoading(true);
    setInitializationError(null);
    try {
      const { data } = await refreshTokenRequest();
      if (!isCurrent()) return;
      if (!handleAuthenticated(data?.data)) {
        throw new Error('The session response did not contain a valid user session.');
      }
    } catch (error) {
      if (!isCurrent()) return;
      const status = error?.response?.status;
      if (error?.isCancelledByLogout || status === 401 || status === 403) {
        clearSession();
      } else {
        setInitializationError(
          'Unable to restore your session. Check your connection and try again.'
        );
      }
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
      }
    }
  }, [clearSession, handleAuthenticated]);

  const retrySession = useCallback(() => restoreSession(), [restoreSession]);

  // On initial app load or page refresh, restore the session using the
  // persistent httpOnly refresh-token cookie before ProtectedRoute makes
  // any redirect decisions.
  useEffect(() => {
    let cancelled = false;

    restoreSession(() => !cancelled);

    return () => {
      cancelled = true;
    };
  }, [clearSession, restoreSession]);

  useEffect(() => {
    const handleForcedLogout = () => {
      clearSession();
      setInitializationError(null);
      setIsLoading(false);
    };
    window.addEventListener('auth:logout', handleForcedLogout);
    window.addEventListener('socket:auth-failed', handleForcedLogout);
    return () => {
      window.removeEventListener('auth:logout', handleForcedLogout);
      window.removeEventListener('socket:auth-failed', handleForcedLogout);
    };
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      initializationError,
      login,
      logout,
      clearSession,
      retrySession,
    }),
    [user, isLoading, initializationError, login, logout, clearSession, retrySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return ctx;
};
