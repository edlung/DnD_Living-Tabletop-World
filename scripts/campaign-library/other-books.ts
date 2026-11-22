import { readdirSync, readFileSync } from 'node:fs';

import type { LibrarySource } from './catalog.ts';

/** The original shelf keeps its order. Additional titles come from the same published books
 * the reader uses, including every mixed-age adventure and both other family adventures. */
export function otherBooks(listed: readonly LibrarySource[]): LibrarySource[] {
  const root = new URL('../../campaigns/', import.meta.url);
  const seen = new Set(listed.map((entry) => entry.id));
  const extra: LibrarySource[] = [
    {
      id: 'lighthouse',
      series: null,
      genre: 'Семейное путешествие между островами',
      audience: '8+',
    },
    {
      id: 'acorn-express',
      series: null,
      genre: 'Семейное железнодорожное приключение',
      audience: '8+',
    },
  ];
  for (const series of [
    'collection-2026',
    'dark-fantasy-2026',
    'fantasy-2026',
    'mixed-ages-2026',
    'noir-2026',
  ]) {
    const dir = new URL(series + '/', root);
    for (const folder of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    )) {
      const id = folder.name;
      if (!folder.isDirectory() || seen.has(id)) continue;
      const world = JSON.parse(readFileSync(new URL(id + '/source/world.json', dir), 'utf8')) as {
        genre: string;
        audience: string;
        slug: string;
      };
      if (world.slug !== id) throw new Error('Incorrect campaign directory: ' + id);
      const genre =
        world.genre.length <= 80 ? world.genre : (world.genre.split(/[,.;:]/)[0] ?? world.genre);
      const label =
        id === 'dragon-retirement' ? 'Фэнтези о дружбе и рискованных горных тропах' : genre;
      extra.push({ id, series, genre: label, audience: world.audience });
      seen.add(id);
    }
  }
  return extra;
}
