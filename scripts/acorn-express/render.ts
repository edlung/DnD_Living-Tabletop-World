import { renderChapters } from './render-chapters.ts';
import { renderMaps } from './render-maps.ts';
import { renderPages } from './render-pages.ts';

await renderPages();
await renderChapters();
await renderMaps();
process.stdout.write(
  'Acorn book: campaign entry, DM guide, 12 evenings, handouts, maps and tokens rendered.',
);
