import { existsSync, readFileSync } from 'node:fs';

const library = new URL('../../fixtures/campaign-library/', import.meta.url);

/** Put the table's complete downloadable editions and art within reach of the ordinary GM book.
 * Player handouts and session pages keep their own navigation. */
export function withBookTableLinks(root: URL, file: string, page: string): string {
  const showNavigation = ['guide.html', 'index.html', 'maps.html'].includes(file);
  if (!showNavigation && !/^session-\d+\.html$/.test(file)) return page;
  const slug = root.pathname.split('/').filter(Boolean).at(-1);
  if (!slug) return page;
  const manifest = new URL(slug + '/library.json', library);
  if (!existsSync(manifest)) return page;
  const entry = JSON.parse(readFileSync(manifest, 'utf8')) as {
    defaultVariant: string;
    variants: { id: string }[];
  };
  const downloads = new Map(
    entry.variants.map((v) => [v.id, 'assets/table-editions/' + v.id + '.json']),
  );
  const base = downloads.get('original-party') ?? downloads.get(entry.defaultVariant);
  if (!base) throw Error('No playable edition of ' + slug);
  const clean = page.replace(/<!-- table-links:start -->[\s\S]*?<!-- table-links:end -->/, '');
  const linked = clean.replace(
    /href="(?:package\.json|variants\/([a-z0-9-]+)\.json)"/g,
    (original: string, id?: string) => {
      const path = id ? downloads.get(id) : base;
      return path ? 'href="' + path + '"' : original;
    },
  );
  if (!showNavigation) return linked;
  const download = linked.includes('href="' + base + '"')
    ? ''
    : ' <a href="' + base + '" download>Скачать игровой комплект</a>';
  const nav =
    '<!-- table-links:start --><nav aria-label="Игровой комплект"><a href="assets/table-editions/gallery.html">Карты и фигурки · ведущему</a>' +
    download +
    '</nav><!-- table-links:end -->';
  return linked.replace(/<main\b[^>]*>/i, (tag) => tag + nav);
}
