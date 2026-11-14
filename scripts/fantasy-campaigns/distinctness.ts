import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Read-only comparison snapshot of the concurrent collections; not an originality oracle. */
const root = fileURLToPath(new URL('../../campaigns/', import.meta.url));
const evidence = fileURLToPath(
  new URL('../../reports/evidence/fantasy-ten-2026-11-08/', import.meta.url),
);
const candidates: string[] = [];
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  candidates.push(join(root, entry.name));
  for (const child of await readdir(join(root, entry.name), { withFileTypes: true }))
    if (child.isDirectory() && !['source', 'assets', 'maps', 'variants'].includes(child.name))
      candidates.push(join(root, entry.name, child.name));
}
interface Fingerprint {
  path: string;
  sha256: string;
  title: unknown;
  pitch: unknown;
  truth: unknown;
  endings: unknown;
  finalSession: unknown;
  closingSessions: unknown[];
  closingSource: string | null;
  closingSourceSha256: string | null;
}
const fingerprints: Fingerprint[] = [];
const duplicated: { first: string; second: string; field: string }[] = [];
const passages = new Map<string, { path: string; field: string }>();
for (const directory of candidates.sort()) {
  let bytes: string;
  try {
    bytes = await readFile(join(directory, 'source/world.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
    throw error;
  }
  const world = JSON.parse(bytes) as Record<string, unknown>;
  const path = relative(root, directory);
  let finalSession: unknown = null;
  let closingSessions: unknown[] = [];
  let closingSource: string | null = null;
  let closingSourceSha256: string | null = null;
  for (const file of ['sessions-4.json', 'act-4.json']) {
    try {
      const closingBytes = await readFile(join(directory, 'source', file), 'utf8');
      const acts = JSON.parse(closingBytes) as Record<string, unknown>[];
      closingSessions = acts.map((session) => ({
        number: session['number'],
        title: session['title'],
        goal: session['goal'],
        ending: session['ending'] ?? session['end'],
        consequences: session['consequences'],
      }));
      finalSession = closingSessions.at(-1) ?? null;
      closingSource = `${path}/source/${file}`;
      closingSourceSha256 = createHash('sha256').update(closingBytes).digest('hex');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  fingerprints.push({
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    title: world['title'],
    pitch: world['pitch'],
    truth: world['truth'],
    endings: world['endings'],
    finalSession,
    closingSessions,
    closingSource,
    closingSourceSha256,
  });
  for (const [field, value] of Object.entries({ pitch: world['pitch'], truth: world['truth'] })) {
    for (const passage of Array.isArray(value) ? value : [value]) {
      if (typeof passage !== 'string' || passage.length < 120) continue;
      const normalized = passage.toLowerCase().replace(/\s+/g, ' ').trim();
      const prior = passages.get(normalized);
      if (prior && (path.startsWith('fantasy-2026/') || prior.path.startsWith('fantasy-2026/')))
        duplicated.push({ first: prior.path, second: path, field });
      else passages.set(normalized, { path, field });
    }
  }
}
await mkdir(evidence, { recursive: true });
await writeFile(
  join(evidence, 'plot-comparison.json'),
  `${JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      method: 'Read-only snapshots of available world sources and final session summaries.',
      limitation:
        'No automated claim of semantic originality; editorial review is DISTINCTNESS.md.',
      duplicatedPassages: duplicated,
      fingerprints,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(
  `${fingerprints.length} available campaign fingerprints; ${duplicated.length} exact duplicate premise/truth passages involving this collection.\n`,
);
if (duplicated.length) process.exitCode = 1;
