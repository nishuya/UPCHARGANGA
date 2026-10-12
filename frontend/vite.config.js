import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Lets the dev server be reached from the network (useful for testing
    // on a phone against the same machine) without changing anything for
    // plain localhost usage.
    host: true,

    // ✅ SPA fallback for development
    // Routes all non-file requests to index.html so React Router can handle them
    middlewareMode: false,

    // Middleware to handle SPA routing in dev server
    middleware: [
      (req, res, next) => {
        // Pass through API requests to backend
        if (req.url.startsWith('/api')) {
          next();
          return;
        }

        // Pass through static assets and known files
        if (req.url.includes('.') && !req.url.endsWith('.html')) {
          next();
          return;
        }

        // For all other routes, serve index.html
        // React Router will handle the actual routing on the client side
        req.url = '/index.html';
        next();
      },
    ],
  },
  build: {
    // Emptydir: false prevents vite from trying to delete the dist folder
    // (which can fail if files are read-only or protected)
    emptyOutDir: false,
  },

  // ✅ Preview server configuration
  preview: {
    port: 4173,
    host: true,
  },
});
