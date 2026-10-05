import { defineConfig } from 'vite';

// Only the local API is proxied. Bearer tokens never enter URLs or static assets.
export default defineConfig({
  resolve: { conditions: ['@ltw/source', 'browser', 'development|production'] },
  server: {
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env['LTW_API_TARGET'] ?? 'http://127.0.0.1:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: { outDir: 'build', emptyOutDir: true, sourcemap: false },
});
