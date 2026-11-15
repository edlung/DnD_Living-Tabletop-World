import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';
import { verifySource } from './editorial.ts';
import { buildEncounters } from './encounters.ts';
import { renderBook, renderCatalog, renderPlayers } from './render-book.ts';
import { renderSession } from './render-session.ts';
import { renderMaps, tacticalMap } from './render-maps.ts';
import { esc, page } from './render-common.ts';

/** Remove only recognizable outputs from this renderer, preserving unknown user files. */
async function pruneGenerated(
  directory: URL,
  expected: Set<string>,
  suffix: string,
  signature: string,
) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(suffix) || expected.has(entry.name)) continue;
    const path = new URL(entry.name, directory);
    if (!(await readFile(path, 'utf8')).includes(signature))
      throw new Error(`Preserved unrecognized file: ${path.pathname}`);
    await unlink(path);
    process.stdout.write(`Removed obsolete generated file: ${entry.name}\n`);
  }
}

const selected = process.argv.slice(2);
const sources = [];
const css = await readFile(new URL('book.css', import.meta.url), 'utf8');
const standalone = (html: string): string =>
  html.replace(/<link rel="stylesheet" href="[^"]+">/, () => `<style>${css}</style>`);
await copyFile(new URL('book.css', import.meta.url), new URL('book.css', COLLECTION_ROOT));
for (const slug of selected.length ? selected : SLUGS) {
  const s = await loadSource(slug);
  verifySource(s);
  sources.push(s);
  const root = new URL(`${slug}/`, COLLECTION_ROOT);
  await mkdir(new URL('handouts/', root), { recursive: true });
  await mkdir(new URL('maps/', root), { recursive: true });
  await pruneGenerated(
    new URL('handouts/', root),
    new Set(s.handouts.map((h) => `${h.key}.html`)),
    '.html',
    'Living Tabletop World · Авторская коллекция · 2026',
  );
  const mapFiles = new Set<string>();
  for (let size = s.world.minPlayers; size <= s.world.maxPlayers; size++)
    for (const e of s.encounters) mapFiles.add(`${e.key}-${size}.svg`);
  await pruneGenerated(
    new URL('maps/', root),
    mapFiles,
    '.svg',
    '<title>Тактическая сетка 14 на 12 клеток</title>',
  );
  const write = (path: string, text: string) => writeFile(new URL(path, root), text);
  await write('index.html', renderBook(s));
  await write('players.html', standalone(renderPlayers(s)));
  await write('maps.html', renderMaps(s));
  for (const session of s.sessions)
    await write(`session-${session.number}.html`, renderSession(s, session));
  for (const h of s.handouts)
    await write(
      `handouts/${h.key}.html`,
      standalone(
        page(
          h.title,
          s.world.title,
          `<article class="handout"><p>${esc(h.text)}</p></article>`,
          '',
          '../../book.css',
          `${h.title} — ${s.world.title}`,
        ),
      ),
    );
  for (let size = s.world.minPlayers; size <= s.world.maxPlayers; size++) {
    const party = s.cast.heroes.slice(0, size).map((h) => h.key);
    for (const e of buildEncounters(s, party))
      await write(`maps/${e.key}-${size}.svg`, tacticalMap(e));
  }
  process.stdout.write(`${slug}: DM/player books, sessions, handouts and maps rendered\n`);
}
if (sources.length === 10)
  await writeFile(new URL('index.html', COLLECTION_ROOT), renderCatalog(sources));
