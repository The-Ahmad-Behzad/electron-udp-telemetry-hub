import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer build config. `base: './'` is required so the packaged app can
// load dist/index.html via file:// with correct relative asset paths.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
