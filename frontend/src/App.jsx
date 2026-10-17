import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './services/queryClient';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';
import FullScreenLoader from './components/common/FullScreenLoader';

/**
 * Wrapper that ensures the initial auth bootstrap completes before
 * rendering any routes. This prevents flashing between protected and
 * login pages during the silent refresh attempt.
 */
const AppContent = () => {
  const { isLoading, initializationError, retrySession } = useAuth();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (initializationError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
        <p role="alert" className="text-ink">
          {initializationError}
        </p>
        <button
          type="button"
          onClick={retrySession}
          className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover"
        >
          Try again
        </button>
      </main>
    );
  }

  return <AppRoutes />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
    {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
  </QueryClientProvider>
);

export default App;
