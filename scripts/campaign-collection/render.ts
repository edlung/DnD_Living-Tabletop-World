import { withBookTableLinks } from '../campaign-shared/book-table-links.ts';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';
import { verifySource } from './editorial.ts';
import { buildEncounters } from './encounters.ts';
import { renderBook, renderCatalog, renderPlayers } from './render-book.ts';
import { renderSession } from './render-session.ts';
import { renderMaps, tacticalMap } from './render-maps.ts';
import { esc, page } from './render-common.ts';

const selected = process.argv.slice(2);
const sources = [];
await copyFile(new URL('book.css', import.meta.url), new URL('book.css', COLLECTION_ROOT));
for (const slug of selected.length ? selected : SLUGS) {
  const s = await loadSource(slug);
  verifySource(s);
  sources.push(s);
  const root = new URL(`${slug}/`, COLLECTION_ROOT);
  await mkdir(new URL('handouts/', root), { recursive: true });
  await mkdir(new URL('maps/', root), { recursive: true });
  const write = (path: string, text: string) =>
    writeFile(new URL(path, root), withBookTableLinks(root, path, text));
  await write(
    'handouts/AGENTS.md',
    '# Released handouts\n\nGenerated from source/handouts.json. Give a player only the specific handout whose release condition has occurred. No DM navigation or release conditions belong in these HTML pages.\n',
  );
  await write(
    'maps/AGENTS.md',
    '# Generated tactical maps\n\nRegenerate from the native encounter geometry with scripts/campaign-collection/render.ts. The number in each filename is the player count and must match the chosen package variant.\n',
  );
  await write('index.html', renderBook(s));
  await write('players.html', renderPlayers(s));
  await write('maps.html', renderMaps(s));
  for (const session of s.sessions)
    await write(`session-${session.number}.html`, renderSession(s, session));
  // A rewritten campaign may drop handouts and encounters: remove their stale pages and maps.
  const keep = new Set(s.handouts.map((h) => `${h.key}.html`));
  for (const name of await readdir(new URL('handouts/', root)))
    if (name.endsWith('.html') && !keep.has(name)) await rm(new URL(`handouts/${name}`, root));
  const evenings = new Set(s.sessions.map((x) => `session-${x.number}.html`));
  for (const name of await readdir(root))
    if (/^session-\d+\.html$/.test(name) && !evenings.has(name)) await rm(new URL(name, root));
  const maps = new Set(s.encounters.map((e) => e.key));
  for (const name of await readdir(new URL('maps/', root)))
    if (name.endsWith('.svg') && !maps.has(name.replace(/-\d+\.svg$/, '')))
      await rm(new URL(`maps/${name}`, root));
  for (const h of s.handouts)
    await write(
      `handouts/${h.key}.html`,
      page(
        h.title,
        s.world.title,
        `<article class="handout"><p>${esc(h.text)}</p></article>`,
        '',
        null,
      ),
    );
  for (let size = s.world.minPlayers; size <= 8; size++) {
    const party = s.cast.heroes.slice(0, size).map((h) => h.key);
    for (const e of buildEncounters(s, party))
      await write(`maps/${e.key}-${size}.svg`, tacticalMap(e));
  }
  process.stdout.write(`${slug}: DM/player books, sessions, handouts and maps rendered\n`);
}
if (sources.length === 10)
  await writeFile(new URL('index.html', COLLECTION_ROOT), renderCatalog(sources));
