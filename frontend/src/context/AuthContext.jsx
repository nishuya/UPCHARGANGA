import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getAccessToken, setAccessToken, clearAccessToken } from '../services/tokenStore';
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

  const handleAuthenticated = useCallback((data) => {
    if (!data?.accessToken || !data?.user) {
      return;
    }
    setAccessToken(data.accessToken);
    setUser(data.user);
    connectSocket();
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
      handleAuthenticated(data.data);
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

  // On initial app load or page refresh, restore the session using the
  // persistent httpOnly refresh-token cookie before ProtectedRoute makes
  // any redirect decisions.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await refreshTokenRequest();
        if (!cancelled && data?.data?.user && data?.data?.accessToken) {
          handleAuthenticated(data.data);
        } else if (!cancelled) {
          clearSession();
        }
      } catch (error) {
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handleAuthenticated, clearSession]);

  useEffect(() => {
    const handleForcedLogout = () => clearSession();
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
      login,
      logout,
      clearSession,
    }),
    [user, isLoading, login, logout, clearSession]
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
