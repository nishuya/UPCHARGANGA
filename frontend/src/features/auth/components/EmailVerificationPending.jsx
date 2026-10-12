import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PremiumAuthLayout from './PremiumAuthLayout';
import Button from '../../patient/components/ui/PButton';
import { resendVerificationRequest } from '../services/auth.api';
import { getApiErrorMessage } from '../../../utils/apiError';

/**
 * Email Verification Pending Screen
 *
 * Shown after successful registration. User must verify their email
 * before they can log in. Provides option to resend verification email.
 */
const EmailVerificationPending = ({ email }) => {
  const navigate = useNavigate();
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState('');

  const handleResendVerification = async () => {
    setResendError('');
    setResendMessage('');
    setIsResending(true);

    try {
      await resendVerificationRequest({ email });
      setResendMessage('Verification email sent! Please check your inbox.');
    } catch (err) {
      setResendError(
        getApiErrorMessage(err, 'Failed to resend verification email. Please try again.')
      );
    } finally {
      setIsResending(false);
    }
  };

  return (
    <PremiumAuthLayout
      page="verification"
      title="Verify your email"
      footerText="Already verified?"
      footerLinkText="Log in"
      footerLinkTo="/login"
    >
      <div className="space-y-lg text-center">
        {/* Success Icon */}
        <div className="flex justify-center mb-lg">
          <div className="w-16 h-16 rounded-full bg-success-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        {/* Message */}
        <div className="space-y-sm">
          <p className="text-body text-neutral-700">
            We've sent a verification email to:
          </p>
          <p className="text-label font-medium text-upchar-600 break-all">
            {email}
          </p>
        </div>

        {/* Instructions */}
        <div className="rounded-lg bg-neutral-50 px-lg py-md text-left">
          <p className="text-body-sm text-neutral-700">
            <strong>Next steps:</strong>
          </p>
          <ol className="mt-sm text-body-sm text-neutral-600 space-y-sm list-decimal list-inside">
            <li>Check your email inbox</li>
            <li>Click the verification link</li>
            <li>Return here and log in</li>
          </ol>
        </div>

        {/* Success Message */}
        {resendMessage && (
          <div className="rounded-lg border border-success-200 bg-success-50 px-lg py-md">
            <p className="text-body-sm font-medium text-success-700">{resendMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {resendError && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 px-lg py-md">
            <p className="text-body-sm font-medium text-danger-700">{resendError}</p>
          </div>
        )}

        {/* Resend Button */}
        <div className="space-y-md pt-lg">
          <p className="text-caption text-neutral-600">
            Didn't receive the email? Check your spam folder or request a new one.
          </p>

          <Button
            type="button"
            variant="outline"
            onClick={handleResendVerification}
            isLoading={isResending}
            className="w-full"
            size="md"
          >
            Resend verification email
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate('/login')}
            className="w-full"
            size="md"
          >
            Already verified? Go to login
          </Button>
        </div>
      </div>
    </PremiumAuthLayout>
  );
};

export default EmailVerificationPending;
