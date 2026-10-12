import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PremiumAuthLayout from '../components/PremiumAuthLayout';
import Button from '../../patient/components/ui/PButton';
import { verifyEmailRequest } from '../services/auth.api';
import { getApiErrorMessage } from '../../../utils/apiError';
import { ROUTES } from '../../../constants/routePaths';

/**
 * Email Verification Page
 *
 * Handles verification link clicks from email.
 * Extracts token from URL, submits to backend for verification,
 * and redirects to login on success.
 */
const VerifyEmailPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setStatus('error');
        setError('Invalid verification link.');
        return;
      }

      try {
        const response = await verifyEmailRequest({ token });
        setStatus('success');
        setMessage(response.data?.data?.message || 'Email verified successfully!');

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate(ROUTES.LOGIN, { replace: true });
        }, 3000);
      } catch (err) {
        setStatus('error');
        setError(getApiErrorMessage(err, 'Failed to verify email. The link may be expired or invalid.'));
      }
    };

    verify();
  }, [token, navigate]);

  if (status === 'verifying') {
    return (
      <PremiumAuthLayout page="verifying" title="Verifying your email...">
        <div className="flex flex-col items-center justify-center space-y-lg">
          <div className="w-12 h-12 border-4 border-neutral-200 border-t-upchar-600 rounded-full animate-spin" />
          <p className="text-body text-neutral-600">Please wait while we verify your email...</p>
        </div>
      </PremiumAuthLayout>
    );
  }

  if (status === 'success') {
    return (
      <PremiumAuthLayout page="verified" title="Email verified!">
        <div className="space-y-lg text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-success-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <div>
            <p className="text-label font-medium text-neutral-700 mb-sm">{message}</p>
            <p className="text-body-sm text-neutral-600">
              Redirecting to login in a few seconds...
            </p>
          </div>

          <Button
            onClick={() => navigate(ROUTES.LOGIN, { replace: true })}
            className="w-full"
            size="md"
          >
            Go to login
          </Button>
        </div>
      </PremiumAuthLayout>
    );
  }

  return (
    <PremiumAuthLayout page="verification-error" title="Verification failed">
      <div className="space-y-lg text-center">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-danger-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-danger-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        </div>

        <div className="rounded-lg border border-danger-200 bg-danger-50 px-lg py-md">
          <p className="text-body-sm font-medium text-danger-700">{error}</p>
        </div>

        <div className="space-y-sm text-left bg-neutral-50 rounded-lg px-lg py-md">
          <p className="text-body-sm text-neutral-700">
            <strong>What can you do?</strong>
          </p>
          <ul className="text-body-sm text-neutral-600 space-y-xs list-disc list-inside">
            <li>The verification link may have expired (15 minutes validity)</li>
            <li>You may have already verified your email</li>
            <li>Request a new verification email from the registration page</li>
          </ul>
        </div>

        <div className="space-y-md">
          <Button
            onClick={() => navigate('/register', { replace: true })}
            variant="outline"
            className="w-full"
            size="md"
          >
            Back to registration
          </Button>

          <Button
            onClick={() => navigate(ROUTES.LOGIN, { replace: true })}
            variant="ghost"
            className="w-full"
            size="md"
          >
            Go to login
          </Button>
        </div>
      </div>
    </PremiumAuthLayout>
  );
};

export default VerifyEmailPage;
