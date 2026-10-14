import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  appType: 'spa',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});
