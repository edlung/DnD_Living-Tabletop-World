import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Immutable evaluation evidence. Every run gets a fresh directory that must not exist yet, and
 * every file is created exclusively (`wx`): nothing is ever overwritten. The historical
 * `reports/evidence/stage-300/` results, blind comparison and key are never written, and no run
 * writes a blind artifact (the owner waived the blind NPC comparison, decisions 2 of 2026-10-11).
 */
export const HISTORICAL_EVIDENCE = fileURLToPath(
  new URL('../../../../../reports/evidence/stage-300/', import.meta.url),
);
export const OFFLINE_EVIDENCE_ROOT = fileURLToPath(
  new URL('../../../../../reports/evidence/stage-300-offline/', import.meta.url),
);
/** Live runs (checkpoint C): only with a stored approval and a registered run. */
export const LIVE_EVIDENCE_ROOT = fileURLToPath(
  new URL('../../../../../reports/evidence/stage-300-live/', import.meta.url),
);

export const newRunId = (now: Date = new Date()): string =>
  `${now.toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;

const inside = (path: string, dir: string): boolean => {
  const rel = relative(resolve(dir), resolve(path));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep));
};

export interface RunDirectory {
  readonly path: string;
  write(name: string, content: string): Promise<void>;
}

/** Creates `root/runId`; fails if it exists or if it would be inside the historical evidence. */
export async function createRunDirectory(root: string, runId: string): Promise<RunDirectory> {
  if (!/^[A-Za-z0-9.-]+$/.test(runId)) throw new Error('invalid run ID');
  const path = join(root, runId);
  if (inside(path, HISTORICAL_EVIDENCE)) {
    throw new Error('refusing to write into the historical Stage 300 evidence');
  }
  await mkdir(root, { recursive: true });
  await mkdir(path);
  return {
    path,
    write: (name, content) => writeFile(join(path, name), content, { flag: 'wx' }),
  };
}
