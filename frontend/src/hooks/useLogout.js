import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../constants/routePaths';

/**
 * Hook that handles logout with automatic redirect to login page.
 * Immediately clears local auth state, revokes the backend refresh session,
 * and replaces history with /login so Back navigation cannot return to protected pages.
 */
export const useLogout = () => {
  const navigate = useNavigate();
  const { logout: authLogout } = useAuth();

  const handleLogout = useCallback(async () => {
    try {
      await authLogout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      navigate(ROUTES.LOGIN, { replace: true, state: null });
    }
  }, [authLogout, navigate]);

  return handleLogout;
};
