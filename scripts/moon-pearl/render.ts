import { renderChapters } from './render-chapters.ts';
import { renderMaps } from './render-maps.ts';
import { renderPages } from './render-pages.ts';

await renderPages();
await renderChapters();
await renderMaps();
process.stdout.write(
  'Pearl book: campaign entry, DM guide, 12 evenings, 24 handouts, maps and tokens rendered.',
);
