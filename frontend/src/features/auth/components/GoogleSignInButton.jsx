import { GoogleLogin } from '@react-oauth/google';

/**
 * Google Sign-In Button Component
 *
 * Uses @react-oauth/google GoogleLogin component to handle Google authentication flow.
 * Returns the ID token (as a JWT credential) which can be verified server-side.
 *
 * The credential contains the ID token that the backend needs to verify.
 */
const GoogleSignInButton = ({ onSuccess, onError, isLoading = false }) => {
  const handleSuccess = (credentialResponse) => {
    try {
      // credentialResponse.credential contains the ID token (JWT)
      // This is what we send to the backend for verification
      if (onSuccess && credentialResponse.credential) {
        onSuccess(credentialResponse.credential);
      }
    } catch (err) {
      if (onError) {
        onError(err);
      }
    }
  };

  const handleError = () => {
    const error = new Error('Google sign-in failed. Please try again.');
    if (onError) {
      onError(error);
    }
  };

  return (
    <div className="w-full">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={handleError}
        useOneTap={false}
        theme="outline"
        size="large"
        width="100%"
        locale="en"
        text={isLoading ? 'Signing in...' : 'signin'}
      />
    </div>
  );
};

export default GoogleSignInButton;
