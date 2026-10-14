import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setAccessToken, clearAccessToken } from '../services/tokenStore';
import { connectSocket, disconnectSocket } from '../sockets/socketClient';
import { loginRequest, logoutRequest, refreshTokenRequest } from '../features/auth/services/auth.api';

const AuthContext = createContext(undefined);

/**
 * Owns the app's ONE piece of client-side auth state: the current user
 * (or null) and a loading flag for the initial bootstrap. The access
 * token itself deliberately does NOT live here as React state — it lives
 * in tokenStore.js (see that file for why), so a token refresh never
 * needs to trigger a re-render of everything that reads useAuth().
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // true until bootstrap finishes

  const handleAuthenticated = useCallback((data) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    connectSocket(); // (re)connect now that tokenStore has a fresh token
  }, []);

  const clearSession = useCallback(() => {
    clearAccessToken();
    setUser(null);
    disconnectSocket();
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
    try {
      // Call the backend logout endpoint to revoke the refresh token session
      // and clear the server-side refresh token hash
      await logoutRequest();
    } catch (error) {
      // Even if the logout request fails (network error, server error),
      // we still clear the local state. A user clicking "log out" expects
      // to be logged out of THIS tab immediately, regardless of the server
      // round-trip outcome.
      console.error('Logout request failed (clearing local state anyway):', error.message);
    } finally {
      // Always clear local state, even if the network call fails (e.g. offline).
      // The browser's cookie clearing happens on the server response, but if
      // the request never reaches the server, we clear locally to ensure the
      // UI is not stuck showing authenticated content.
      clearSession();
    }
  }, [clearSession]);

  // On first load and on page refresh, there is no access token in memory
  // (by design — see tokenStore.js). This silently attempts a refresh using
  // the httpOnly refresh-token cookie, so a page reload doesn't force a fresh
  // login as long as a valid session cookie still exists.
  //
  // This effect runs ONCE on mount (via empty dependency array) and must
  // complete before ProtectedRoute allows any navigation decisions.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await refreshTokenRequest();
        if (!cancelled) {
          handleAuthenticated(data.data);
        }
      } catch (error) {
        // The refresh endpoint returned an error (401, etc.) or the request failed.
        // Either way, there's no valid session, so clear the local state.
        if (!cancelled) {
          console.log('Session restore failed (user not authenticated):', error.response?.status || error.message);
          clearSession();
        }
      } finally {
        // Bootstrap complete — ProtectedRoute can now make route decisions.
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // apiClient dispatches this when a token refresh fails mid-session
  // (e.g. the refresh token itself expired, was reused, or the session
  // was revoked on the server) — see services/apiClient.js. A DOM event,
  // not a direct import, is what lets that file trigger a logout without
  // importing React/context at all.
  useEffect(() => {
    const handleForcedLogout = () => clearSession();
    window.addEventListener('auth:logout', handleForcedLogout);
    return () => window.removeEventListener('auth:logout', handleForcedLogout);
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
    }),
    [user, isLoading, login, logout]
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
