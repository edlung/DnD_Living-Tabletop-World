import { renderChapters } from './render-chapters.ts';
import { renderMaps } from './render-maps.ts';
import { renderPages } from './render-pages.ts';

await renderPages();
await renderChapters();
await renderMaps();
process.stdout.write(
  'Lighthouse book: campaign entry, DM guide, 12 evenings, 22 handouts, maps and tokens rendered.',
);
