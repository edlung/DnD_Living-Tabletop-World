import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const at = (path) => fileURLToPath(new URL(path, import.meta.url));
const web = '../../../apps/web/';
const notices = await Promise.all(
  ['three', 'cannon-es'].map(
    async (name) =>
      name + '\n' + (await readFile(at(web + 'node_modules/' + name + '/LICENSE'), 'utf8')),
  ),
);
await build({
  root: at(web),
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  resolve: { dedupe: ['three', 'cannon-es'] },
  build: {
    target: 'es2022',
    outDir: at('./runtime/'),
    emptyOutDir: false,
    reportCompressedSize: false,
    lib: {
      entry: at('./dice-3d/stage.js'),
      name: 'LighthouseDice3D',
      formats: ['iife'],
      fileName: () => 'dice3d.min.js',
    },
    rolldownOptions: {
      output: {
        banner:
          '/*! Lighthouse pilot. Three.js and cannon-es licenses are in THIRD_PARTY_LICENSES.txt. */',
      },
    },
  },
});
await writeFile(at('./runtime/THIRD_PARTY_LICENSES.txt'), notices.join('\n'));
