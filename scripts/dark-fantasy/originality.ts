import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { SLUGS, loadSource } from './source.ts';

/** Local editorial evidence, not a claim of universal originality or a semantic proof. */
const root = new URL('../../campaigns/', import.meta.url);
const worlds: {
  path: string;
  sha256: string;
  title: string;
  pitch: string;
  truth: string[];
  endings: unknown;
}[] = [];
const externalSceneFiles: { path: string; sha256: string; plays: string[] }[] = [];
async function visit(directory: URL): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (['assets', 'maps', 'handouts', 'variants', 'node_modules'].includes(entry.name)) continue;
      await visit(new URL(`${entry.name}/`, directory));
    } else if (entry.name === 'world.json' && directory.pathname.endsWith('/source/')) {
      const path = new URL(entry.name, directory);
      const bytes = await readFile(path, 'utf8');
      const world = JSON.parse(bytes) as {
        title: string;
        pitch: string;
        truth: string[];
        endings?: unknown;
      };
      worlds.push({
        path: path.pathname.split('/campaigns/')[1] ?? path.pathname,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        title: world.title,
        pitch: world.pitch,
        truth: world.truth,
        endings: world.endings ?? null,
      });
    } else if (
      /^sessions-\d+\.json$/.test(entry.name) &&
      directory.pathname.endsWith('/source/') &&
      !directory.pathname.includes('/dark-fantasy-2026/')
    ) {
      const path = new URL(entry.name, directory);
      const bytes = await readFile(path, 'utf8');
      const sessions: unknown = JSON.parse(bytes);
      const plays: string[] = [];
      if (Array.isArray(sessions))
        for (const session of sessions as { scenes?: { play?: unknown }[] }[])
          for (const scene of session.scenes ?? [])
            if (typeof scene.play === 'string') plays.push(scene.play);
      if (plays.length)
        externalSceneFiles.push({
          path: path.pathname.split('/campaigns/')[1] ?? path.pathname,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          plays,
        });
    }
  }
}
await visit(root);
const seen = new Map<string, string>();
const repetitions = new Set<string>();
for (const slug of SLUGS) {
  const source = await loadSource(slug);
  for (const session of source.sessions)
    for (const [i, scene] of session.scenes.entries()) {
      const id = `${slug}/${session.number}/${i + 1}`;
      const words = scene.play.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      for (let j = 0; j + 18 <= words.length; j++) {
        const phrase = words.slice(j, j + 18).join(' ');
        const old = seen.get(phrase);
        if (old && old.split('/')[0] !== slug) repetitions.add(`${old} / ${id}: ${phrase}`);
        else seen.set(phrase, id);
      }
    }
}
const externalRepetitions = new Set<string>();
for (const file of externalSceneFiles)
  for (const [i, play] of file.plays.entries()) {
    const words = play.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    for (let j = 0; j + 18 <= words.length; j++) {
      const phrase = words.slice(j, j + 18).join(' ');
      const own = seen.get(phrase);
      if (own) externalRepetitions.add(`${own} / ${file.path} scene ${i + 1}: ${phrase}`);
    }
  }
const evidence = new URL('../../reports/evidence/dark-fantasy-2026-11-08/', import.meta.url);
await mkdir(evidence, { recursive: true });
await writeFile(
  new URL('originality-evidence.json', evidence),
  `${JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Available local worlds and source/sessions-N.json play text. Eighteen-word matching is an editorial signal, not a semantic proof; incomplete or differently structured neighboring sources are not passed.', worlds, repetitions: [...repetitions], externalSceneFiles: externalSceneFiles.map(({ path, sha256, plays }) => ({ path, sha256, sceneCount: plays.length })), externalRepetitions: [...externalRepetitions] }, null, 2)}\n`,
);
process.stdout.write(
  `${worlds.length} available world summaries retained; ${repetitions.size} repeated phrases within collection; ${externalRepetitions.size} matches across ${externalSceneFiles.length} neighboring scene files\n`,
);
if (repetitions.size || externalRepetitions.size) process.exitCode = 1;
