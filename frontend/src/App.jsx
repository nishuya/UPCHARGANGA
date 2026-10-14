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
  const { isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenLoader />;
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
