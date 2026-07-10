import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app shell (src/app) imports the headless engine (src/engine) directly.
// Vite resolves the engine's `.js` import specifiers to their `.ts` sources.
export default defineConfig({
  plugins: [react()],
  // Capacitor loads the built assets from a file:// origin, so relative paths.
  base: './',
  build: {
    outDir: 'dist',
    // Keep the engine and app in one bundle; nothing here needs code-splitting yet.
    target: 'es2020',
  },
  server: {
    host: true,
    port: 5173,
  },
});
