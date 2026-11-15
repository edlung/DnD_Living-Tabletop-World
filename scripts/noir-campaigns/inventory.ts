import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLUGS, loadSource } from './source.ts';
import { verifySource } from './editorial.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = join(root, 'reports/evidence/noir-ten-2026-11-08');
const sources = await Promise.all(SLUGS.map(loadSource));
const summary = sources.map((s) => {
  verifySource(s);
  return {
    slug: s.world.slug,
    title: s.world.title,
    audience: s.world.audience,
    sessions: s.sessions.length,
    scenes: s.sessions.reduce((n, x) => n + x.scenes.length, 0),
    heroes: s.cast.heroes.length,
    npcs: s.cast.npcs.length,
    clues: s.clues.length,
    handouts: s.handouts.length,
    encounters: s.encounters.length,
    routes: s.case.routes.map((r) => ({ key: r.key, clues: r.clues })),
    sceneWordRange: [
      Math.min(...s.sessions.flatMap((x) => x.scenes.map((c) => c.play.split(/\s+/).length))),
      Math.max(...s.sessions.flatMap((x) => x.scenes.map((c) => c.play.split(/\s+/).length))),
    ],
    playerSizes: s.world.scaling.map((x) => x.players),
    sessionDuration: s.world.sessionDuration,
    sceneMinutes: s.sessions.map((x) => x.scenes.reduce((n, c) => n + c.minutes, 0)),
    allCharactersAdult: [...s.cast.heroes, ...s.cast.npcs].every((x) => x.age >= 21),
  };
});

interface Neighbor {
  path: string;
  sha256: string;
  title: unknown;
  pitch: unknown;
  truth: unknown;
  endings: unknown;
}
const neighbors: Neighbor[] = [];
async function inspect(dir: string) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      ['noir-2026', 'assets', 'variants', 'maps', 'handouts', 'node_modules'].includes(entry.name)
    )
      continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else if (entry.name === 'world.json' && dir.endsWith('/source')) {
      const bytes = await readFile(path, 'utf8');
      const world = JSON.parse(bytes) as Record<string, unknown>;
      neighbors.push({
        path: relative(root, path),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        title: world['title'],
        pitch: world['pitch'],
        truth: world['truth'],
        endings: world['endings'],
      });
    }
  }
}
await inspect(join(root, 'campaigns'));
await writeFile(join(evidence, 'content-inventory.json'), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(
  join(evidence, 'neighbor-snapshot.json'),
  `${JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      note: 'Accessible drafts only. Inventory supports editorial review; hashes do not prove plot originality.',
      neighbors,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(
  `${summary.length} complete noir sources; ${neighbors.length} neighboring drafts recorded\n`,
);
