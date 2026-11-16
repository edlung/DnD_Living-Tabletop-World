import { defineConfig, type Plugin } from 'vite';

import manifest from './src/assets/ui-kit.manifest.json' with { type: 'json' };

/**
 * The UI kit's URL maps in development (`src/visual/ui-kit.ts`). An eager `?url` glob is, on the
 * dev server, one module request per file on every page load: over four hundred of them since
 * the SRD catalog was pictured, nearly half of all a page asks for — and every browser journey
 * loads its pages from this server. Here each such glob is written out as the map it stands for,
 * file path to the address the dev server serves the file at, so a page asks for none of them.
 * The files are the manifest's (`tests/ui-kit/ui-kit-manifest.test.ts` holds it to the folder).
 * The build is untouched: the bundler still reads the globs and emits each file. A picture added
 * while the dev server runs shows after its restart.
 */
const KIT = '../assets/ui-kit/';
const KIT_FILES = Object.keys(manifest.assets).sort();
const URL_GLOB =
  /import\.meta\.glob<string>\(\s*'\.\.\/assets\/ui-kit\/([^'*]+\/)\*\.(png|webp)',\s*\{\s*eager: true,\s*query: '\?url',\s*import: 'default',\s*\},?\s*\)/g;

function uiKitUrlsInDevelopment(): Plugin {
  return {
    name: 'ltw:ui-kit-urls',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id) {
      if (!(id.split('?')[0] ?? id).endsWith('/src/visual/ui-kit.ts')) return null;
      const written = code.replace(URL_GLOB, (_glob, folder: string, extension: string) => {
        const urls = KIT_FILES.filter(
          (path) =>
            path.startsWith(folder) &&
            !path.slice(folder.length).includes('/') &&
            path.endsWith(`.${extension}`),
        ).map((path) => [`${KIT}${path}`, `/src/assets/ui-kit/${path}`]);
        return `(${JSON.stringify(Object.fromEntries(urls))} as Record<string, string>)`;
      });
      // A glob this does not recognise would silently go back to a request per file.
      if (written.includes('import.meta.glob')) {
        this.error('ui-kit.ts holds a glob that vite.config.ts does not write out');
      }
      return { code: written, map: null };
    },
  };
}

/**
 * The dev client reloads a page whose connection to this server (the one hot reloading uses) was
 * lost and found again. In WebKit that connection now and then closes under a browser journey,
 * and the journey's page came back signed in but at its start, the sheet it was using shut. Under
 * `LTW_VITE_NO_RELOAD` (the journeys' servers, playwright.config.ts) the client keeps its
 * connection as ever and only that reload is taken out: a journey edits no source, so a page
 * that lost the connection has lost nothing. The client's text is Vite's own; if it no longer
 * reads as expected, the server says so instead of quietly reloading pages again.
 */
const LOST_CONNECTION = 'if (payload.event === "vite:ws:disconnect") {';

function keepsPagesAfterLostConnection(): Plugin {
  return {
    name: 'ltw:no-reload-after-lost-connection',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id) {
      if (!(id.split('?')[0] ?? id).endsWith('/vite/dist/client/client.mjs')) return null;
      if (code.split(LOST_CONNECTION).length !== 2) {
        this.error('the dev client does not read as vite.config.ts expects (LTW_VITE_NO_RELOAD)');
      }
      return { code: code.replace(LOST_CONNECTION, 'if (false) {'), map: null };
    },
  };
}

// Only the local API is proxied. Bearer tokens never enter URLs or static assets.
// LTW_VITE_CACHE_DIR gives a second dev server of the same client (the browser tests' sign-in
// server, playwright.config.ts) its own dependency cache, so two servers never race on one.
const cacheDir = process.env['LTW_VITE_CACHE_DIR'];
const noReload = process.env['LTW_VITE_NO_RELOAD'] !== undefined;
export default defineConfig({
  plugins: [uiKitUrlsInDevelopment(), ...(noReload ? [keepsPagesAfterLostConnection()] : [])],
  ...(cacheDir === undefined ? {} : { cacheDir }),
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
  build: {
    outDir: 'build',
    emptyOutDir: true,
    sourcemap: false,
    // UI-kit pictures stay files (cached once, referenced by URL), never base64 in the bundle.
    assetsInlineLimit: (file) => (file.includes('/assets/ui-kit/') ? false : undefined),
  },
});
