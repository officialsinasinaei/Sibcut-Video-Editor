import { defineConfig } from 'vite';

/**
 * Vite config for the Electron desktop build.
 * Fully self-contained build with relative paths and ES module worker support.
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    cssTarget: 'safari16',
    chunkSizeWarningLimit: 900,
    outDir: 'dist',
  },
  worker: {
    format: 'es',
  },
});
