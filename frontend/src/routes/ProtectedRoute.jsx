import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../constants/routePaths';
import FullScreenLoader from '../components/common/FullScreenLoader';

/**
 * Gate for every authenticated route tree.
 *
 * Three states, checked in order:
 *  1. Still bootstrapping (AuthContext hasn't finished its silent
 *     refresh attempt yet) -> show a loader, render nothing else.
 *  2. Not authenticated -> redirect to /login (preserving intended URL in state.from).
 *  3. Authenticated but wrong role -> redirect to /unauthorized.
 */
const ProtectedRoute = ({ allowedRoles }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated || !user) {
    return (
      <Navigate
        to={ROUTES.LOGIN}
        state={{ from: `${location.pathname}${location.search}` }}
        replace
      />
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
