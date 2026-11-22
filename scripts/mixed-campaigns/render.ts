import { withBookTableLinks } from '../campaign-shared/book-table-links.ts';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { COLLECTION_ROOT, SLUGS, loadSource, type Source } from './source.ts';
import { verifySource } from './editorial.ts';
import { esc, p, page } from './render-common.ts';
import { renderCatalog, renderDm, renderPlayers, standalone } from './render-pages.ts';
import { battleMapFor, renderMaps } from './render-maps.ts';
import { renderSession } from './render-session.ts';

const css = await readFile(new URL('./book.css', import.meta.url), 'utf8');
await writeFile(new URL('book.css', COLLECTION_ROOT), css);
const selected = process.argv.slice(2);
const sources: Source[] = [];
// These directories are generated outputs. Retired handouts must not survive a story revision.
async function prune(directory: URL, extension: string, expected: Set<string>) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(extension) && !expected.has(entry.name))
      await unlink(new URL(entry.name, directory));
  }
}
for (const slug of selected.length ? selected : SLUGS) {
  const s = await loadSource(slug);
  verifySource(s);
  sources.push(s);
  const save = (file: string, text: string) =>
    writeFile(
      new URL(`${slug}/${file}`, COLLECTION_ROOT),
      withBookTableLinks(new URL(slug + '/', COLLECTION_ROOT), file, text),
    );
  await mkdir(new URL(`${slug}/handouts/`, COLLECTION_ROOT), { recursive: true });
  await mkdir(new URL(`${slug}/maps/`, COLLECTION_ROOT), { recursive: true });
  await prune(
    new URL(`${slug}/handouts/`, COLLECTION_ROOT),
    '.html',
    new Set(s.handouts.map((h) => `${h.key}.html`)),
  );
  await prune(
    new URL(`${slug}/maps/`, COLLECTION_ROOT),
    '.svg',
    new Set(s.encounters.map((e) => `${e.key}.svg`)),
  );
  await save('index.html', renderDm(s));
  await save('players.html', renderPlayers(s, css));
  await save('maps.html', renderMaps(s));
  for (const session of s.sessions)
    await save(`session-${session.number}.html`, renderSession(s, session));
  for (const encounter of s.encounters)
    await save(`maps/${encounter.key}.svg`, battleMapFor(s, encounter));
  for (const h of s.handouts)
    await save(
      `handouts/${h.key}.html`,
      standalone(
        page(
          h.title,
          s.world.title,
          `<article class="handout" aria-label="${esc(h.title)}">${p(h.text)}</article>`,
          '',
          '',
        ),
        css,
      ),
    );
  process.stdout.write(`${slug}: local books, player export, handouts and maps rendered\n`);
}
// A partial render must not replace a complete collection catalogue.
if (!selected.length)
  await writeFile(new URL('index.html', COLLECTION_ROOT), renderCatalog(sources));
