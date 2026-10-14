import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import PremiumAuthLayout from '../components/PremiumAuthLayout';
import Field from '../../patient/components/ui/PField';
import Button from '../../patient/components/ui/PButton';
import { useAuth } from '../../../context/AuthContext';
import { ROUTES } from '../../../constants/routePaths';
import { USER_ROLES } from '../../../constants/roles';
import { getApiErrorMessage } from '../../../utils/apiError';

export const ROLE_HOME = {
  [USER_ROLES.PATIENT]: ROUTES.PATIENT.ROOT,
  [USER_ROLES.RECEPTIONIST]: ROUTES.RECEPTION?.ROOT,
  [USER_ROLES.DOCTOR_ASSISTANT]: ROUTES.DOCTOR?.ROOT,
  [USER_ROLES.DOCTOR]: ROUTES.DOCTOR?.ROOT,
  [USER_ROLES.ADMIN]: ROUTES.ADMIN?.ROOT,
};

const getRedirectTargetForUser = (user, fromPath) => {
  const roleRoot = ROLE_HOME[user?.role] || ROUTES.HOME;
  if (
    typeof fromPath === 'string' &&
    fromPath.startsWith('/') &&
    roleRoot !== ROUTES.HOME &&
    fromPath.startsWith(roleRoot)
  ) {
    return fromPath;
  }
  return roleRoot;
};

const LoginPage = () => {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If the user's persistent session was already restored (e.g., reopened browser on /login),
  // redirect them straight to their role dashboard or intended deep link.
  if (isAuthenticated && user) {
    const target = getRedirectTargetForUser(user, location.state?.from);
    return <Navigate to={target} replace />;
  }

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const loggedInUser = await login(form);
      const target = getRedirectTargetForUser(loggedInUser, location.state?.from);
      navigate(target, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Invalid email or password. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PremiumAuthLayout
      page="login"
      title="Welcome back"
      footerText="Don't have an account?"
      footerLinkText="Register"
      footerLinkTo={ROUTES.REGISTER}
    >
      <form onSubmit={handleSubmit} className="space-y-lg">
        {/* Email Field */}
        <Field
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={handleChange}
          required
        />

        {/* Password Field with Toggle */}
        <div className="space-y-md">
          <div className="flex items-center justify-between">
            <label className="text-label font-medium uppercase tracking-wide text-neutral-700">
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-caption font-medium text-upchar-600 hover:text-upchar-700 transition-colors duration-fast"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              required
              className="w-full rounded-md border border-upchar-200 bg-neutral-0 px-md py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 transition-all duration-fast focus:border-upchar-500 focus:shadow-focus-ring focus:outline-none disabled:bg-upchar-50 disabled:text-neutral-400"
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 px-lg py-md">
            <p className="text-body-sm font-medium text-danger-700">{error}</p>
          </div>
        )}

        {/* Login Button */}
        <Button
          type="submit"
          isLoading={isSubmitting}
          className="w-full"
          size="md"
        >
          Log in to UpcharGanga
        </Button>

        {/* Helpful text */}
        <p className="text-caption text-neutral-600 text-center">
          Use your email and password to access your appointments and queue tracking.
        </p>
      </form>
    </PremiumAuthLayout>
  );
};

export default LoginPage;
