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
        // The live signal (ADR 0033) is an event stream: pass every frame on as it arrives.
        // The proxy pipes the body unbuffered and drops the upstream request when the
        // browser leaves; here each stream is sent without delay and never times out.
        configure: (proxy) => {
          proxy.on('proxyRes', (response, _request, outgoing) => {
            if (!response.headers['content-type']?.startsWith('text/event-stream')) return;
            response.headers['x-accel-buffering'] = 'no';
            outgoing.socket?.setNoDelay(true);
            outgoing.socket?.setTimeout(0);
          });
        },
      },
    },
  },
  build: { outDir: 'build', emptyOutDir: true, sourcemap: false },
});
