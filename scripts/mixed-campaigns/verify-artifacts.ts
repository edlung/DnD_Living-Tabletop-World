import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { COLLECTION_ROOT, SLUGS, loadSource } from './source.ts';
import { buildPackage } from './package.ts';
import { renderCatalog, renderDm, renderPlayers, standalone } from './render-pages.ts';
import { battleMapFor, renderMaps } from './render-maps.ts';
import { renderSession } from './render-session.ts';
import { esc, p, page } from './render-common.ts';

// Detect stale packages, stale books and retired handouts after concurrent editorial revisions.
const sources = await Promise.all(SLUGS.map(loadSource));
const css = await readFile(new URL('./book.css', import.meta.url), 'utf8');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
let checked = 0;
async function exact(file: string, expected: string) {
  assert((await readFile(new URL(file, COLLECTION_ROOT), 'utf8')) === expected, `Stale ${file}`);
  checked++;
}
await exact('book.css', css);
await exact('index.html', renderCatalog(sources));
const counts = [];
for (const s of sources) {
  const slug = s.world.slug;
  const verification = JSON.parse(
    await readFile(new URL(`${slug}/verification.json`, COLLECTION_ROOT), 'utf8'),
  ) as {
    sourceHashes: Record<string, string>;
    variants: { size: number; sha256: string; readiness: string }[];
    counts: Record<string, number>;
  };
  for (const [file, hash] of Object.entries(verification.sourceHashes))
    assert.equal(sha(await readFile(new URL(`${slug}/${file}`, COLLECTION_ROOT), 'utf8')), hash);
  assert.equal(Object.keys(verification.sourceHashes).length, 9);
  assert.equal(verification.variants.length, 5);
  for (let size = 3; size <= 7; size++) {
    const expected = `${JSON.stringify(buildPackage(s, size), null, 2)}\n`;
    await exact(`${slug}/variants/${size}-players.json`, expected);
    const result = verification.variants.find((v) => v.size === size);
    assert(result, `${slug}: missing verification for ${size}`);
    assert.equal(result.sha256, sha(expected));
    assert.equal(result.readiness, 'READY');
    if (size === 4) await exact(`${slug}/package.json`, expected);
  }
  await exact(`${slug}/index.html`, renderDm(s));
  await exact(`${slug}/players.html`, renderPlayers(s, css));
  await exact(`${slug}/maps.html`, renderMaps(s));
  for (const session of s.sessions)
    await exact(`${slug}/session-${session.number}.html`, renderSession(s, session));
  for (const e of s.encounters) await exact(`${slug}/maps/${e.key}.svg`, battleMapFor(s, e));
  for (const h of s.handouts)
    await exact(
      `${slug}/handouts/${h.key}.html`,
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
  for (const [folder, extension, expected] of [
    ['handouts', '.html', s.handouts.map((h) => `${h.key}.html`)],
    ['maps', '.svg', s.encounters.map((e) => `${e.key}.svg`)],
  ] as const) {
    const actual = (await readdir(new URL(`${slug}/${folder}/`, COLLECTION_ROOT))).filter((n) =>
      n.endsWith(extension),
    );
    assert.deepEqual(actual.sort(), [...expected].sort(), `${slug}: orphan ${folder}`);
  }
  counts.push({ slug, ...verification.counts });
}
const result = { status: 'PASS', checkedArtifacts: checked, variants: 50, campaigns: counts };
await writeFile(
  new URL(
    '../../reports/evidence/mixed-ten-2026-11-08/artifact-verification.json',
    import.meta.url,
  ),
  `${JSON.stringify(result, null, 2)}\n`,
);
process.stdout.write(
  `${checked} current artifacts; 50 variant hashes; no retired handouts/maps: PASS\n`,
);
