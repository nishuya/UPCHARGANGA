import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PremiumAuthLayout from '../components/PremiumAuthLayout';
import Field from '../../patient/components/ui/PField';
import Button from '../../patient/components/ui/PButton';
import { registerRequest } from '../services/auth.api';
import { ROUTES } from '../../../constants/routePaths';
import { getApiErrorMessage } from '../../../utils/apiError';

const INITIAL_FORM = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  gender: '',
  dateOfBirth: '',
};

/**
 * Premium UpcharGanga Registration Page
 *
 * Features:
 * - Two-column layout on desktop (branding + form)
 * - Single column on mobile
 * - Healthcare onboarding experience
 * - Progressive form with clear hierarchy
 * - Password show/hide toggle
 * - Optional fields clearly marked
 * - Professional validation
 * - Error handling
 */
const RegisterPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (form.password.length > 12) {
      setError('Password must be no more than 12 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = { ...form };
      if (!payload.gender) delete payload.gender;
      if (!payload.dateOfBirth) delete payload.dateOfBirth;

      await registerRequest(payload);

      navigate(ROUTES.LOGIN, {
        replace: true,
        state: { justRegistered: true },
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Registration failed. Please check your details.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PremiumAuthLayout
      page="register"
      title="Create your account"
      footerText="Already have an account?"
      footerLinkText="Log in"
      footerLinkTo={ROUTES.LOGIN}
    >
      <form onSubmit={handleSubmit} className="space-y-lg">
        {/* Section: Personal Information */}
        <div>
          <h3 className="text-label font-medium uppercase tracking-widest text-neutral-700 mb-lg">
            Your Information
          </h3>

          <div className="space-y-lg">
            <Field
              label="Full name"
              name="fullName"
              autoComplete="name"
              placeholder="Your full name"
              value={form.fullName}
              onChange={handleChange}
              required
            />

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

            <Field
              label="Phone number"
              name="phone"
              autoComplete="tel"
              placeholder="+91 XXXXX XXXXX"
              value={form.phone}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-neutral-200" />

        {/* Section: Security */}
        <div>
          <h3 className="text-label font-medium uppercase tracking-widest text-neutral-700 mb-lg">
            Security
          </h3>

          <div className="space-y-md">
            <div>
              <div className="flex items-center justify-between mb-md">
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
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                className="w-full rounded-md border border-upchar-200 bg-neutral-0 px-md py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 transition-all duration-fast focus:border-upchar-500 focus:shadow-focus-ring focus:outline-none disabled:bg-upchar-50 disabled:text-neutral-400"
              />
              <p className="mt-sm text-caption text-neutral-600">
                Use 6–12 characters. Any characters are allowed.
              </p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-neutral-200" />

        {/* Section: Optional Details */}
        <div>
          <h3 className="text-label font-medium uppercase tracking-widest text-neutral-700 mb-lg">
            Optional
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-lg">
            <Field
              label="Gender"
              as="select"
              name="gender"
              value={form.gender}
              onChange={handleChange}
            >
              <option value="">Not specified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Field>

            <Field
              label="Date of birth"
              type="date"
              name="dateOfBirth"
              value={form.dateOfBirth}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 px-lg py-md">
            <p className="text-body-sm font-medium text-danger-700">{error}</p>
          </div>
        )}

        {/* Terms & Conditions */}
        <p className="text-caption text-neutral-600 text-center">
          By registering, you agree to our Terms of Service and Privacy Policy.
        </p>

        {/* Register Button */}
        <Button
          type="submit"
          isLoading={isSubmitting}
          className="w-full"
          size="md"
        >
          Create account
        </Button>
      </form>
    </PremiumAuthLayout>
  );
};

export default RegisterPage;
