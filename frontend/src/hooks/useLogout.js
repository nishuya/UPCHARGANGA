import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../constants/routePaths';

/**
 * Hook that handles logout with automatic redirect to login page.
 * Clears auth state, calls backend logout, and navigates to login.
 *
 * Usage: const handleLogout = useLogout();
 */
export const useLogout = () => {
  const navigate = useNavigate();
  const { logout: authLogout } = useAuth();

  const handleLogout = useCallback(async () => {
    try {
      // Clear auth state (calls backend to revoke session, clears local token)
      await authLogout();
      // Navigate to login page after logout is complete
      navigate(ROUTES.LOGIN, { replace: true });
    } catch (error) {
      // Even if logout fails, we've already cleared local state
      // Navigate to login so user can log in again
      console.error('Logout error:', error);
      navigate(ROUTES.LOGIN, { replace: true });
    }
  }, [authLogout, navigate]);

  return handleLogout;
};
