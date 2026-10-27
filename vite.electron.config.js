import { defineConfig } from 'vite';

/**
 * Vite config for the Electron desktop build.
 * Same as vite.config.js but without the puter-localhost dev-server plugin
 * (that plugin only applies to `serve` anyway, but we avoid the import so
 * this config is fully self-contained and works without the monorepo sibling).
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
