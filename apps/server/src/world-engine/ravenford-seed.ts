import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { campaignIdSchema, type CommandRejected } from '@ltw/contracts';
import { actorSchema, submissionsFromScript, type Actor, type WorldEngine } from '@ltw/domain';
import { z } from 'zod';

/** `fixtures/ravenford/`, resolved from both `src/` and `dist/`. */
export const RAVENFORD_FIXTURES_DIR = fileURLToPath(
  new URL('../../../../fixtures/ravenford/', import.meta.url),
);

/** `fixtures/ravenford-ru/`: the Russian Ravenford (docs/adr/0031-play-language.md §9). */
export const RAVENFORD_RU_FIXTURES_DIR = fileURLToPath(
  new URL('../../../../fixtures/ravenford-ru/', import.meta.url),
);

/** A seed script and its command-ID prefix, part of seeded history: never renamed. */
export interface SeedFile {
  readonly file: string;
  readonly prefix: string;
}

/**
 * Seed scripts in order, each with its command-ID prefix. Prefixes are part
 * of seeded history (idempotency keys): never rename them.
 */
export const RAVENFORD_SEED_FILES: readonly SeedFile[] = [
  { file: 'kernel-seed.json', prefix: 'seed' },
  { file: 'knowledge-seed.json', prefix: 'knowledge' },
  { file: 'memory-seed.json', prefix: 'memory' },
  { file: 'rules-seed.json', prefix: 'rules' },
  { file: 'investigation-seed.json', prefix: 'investigation' },
  { file: 'contradiction-seed.json', prefix: 'contradiction' },
  { file: 'combat-seed.json', prefix: 'combat' },
  { file: 'items-seed.json', prefix: 'items' },
  { file: 'table-seed.json', prefix: 'table' },
];

const seedSchema = z.object({
  campaignId: campaignIdSchema,
  dmActorId: actorSchema.shape.actorId,
  commands: z.array(z.unknown()).min(1),
});

export interface RavenfordSeed {
  readonly campaignId: string;
  readonly dm: Actor;
  /** Engine submissions with deterministic command IDs (seeding is idempotent). */
  readonly submissions: readonly unknown[];
}

export const loadRavenfordSeed = (directory = RAVENFORD_FIXTURES_DIR): Promise<RavenfordSeed> =>
  loadSeed(directory, RAVENFORD_SEED_FILES);

/** A ready adventure's seed scripts, in order, as one list of engine submissions. */
export async function loadSeed(
  directory: string,
  files: readonly SeedFile[],
): Promise<RavenfordSeed> {
  const scripts = await Promise.all(
    files.map(async ({ file, prefix }) => ({
      prefix,
      seed: seedSchema.parse(JSON.parse(await readFile(join(directory, file), 'utf8'))),
    })),
  );
  const first = scripts[0]?.seed;
  if (
    !first ||
    scripts.some(
      ({ seed }) => seed.campaignId !== first.campaignId || seed.dmActorId !== first.dmActorId,
    )
  ) {
    throw new Error(`the seed files of ${directory} disagree on campaign or DM`);
  }
  const dm: Actor = { actorId: first.dmActorId, kind: 'user' };
  return {
    campaignId: first.campaignId,
    dm,
    submissions: scripts.flatMap(({ prefix, seed }) =>
      submissionsFromScript({
        campaignId: seed.campaignId,
        actor: dm,
        commands: seed.commands,
        commandIdPrefix: `${seed.campaignId}.${prefix}`,
      }),
    ),
  };
}

/** Where the operator resets a campaign database whose seed changed (deploy/RUNBOOK.md). */
export const SEED_RESET_PROCEDURE = 'deploy/RUNBOOK.md, section 12';

/**
 * Why a seed command was refused, for the operator. Seed command IDs are positional
 * (`<campaign>.<prefix>.NNNN`), so a seed whose fixtures changed since this database was seeded
 * (Gate 06 gave secret entities opaque IDs) meets its own IDs holding other commands: that is not
 * a rerun, and only a fresh database helps. A database holding the other language's Ravenford is
 * said as such.
 */
export async function seedRefusal(
  engine: WorldEngine,
  campaignId: string,
  language: string,
  commandId: string,
  result: CommandRejected,
): Promise<string> {
  const plain = `seed command ${commandId} rejected: ${result.code}`;
  if (result.code !== 'COMMAND_ID_CONFLICT') return `${plain} (${result.message})`;
  const held = (await engine.load(campaignId))?.state.campaign;
  if (held && held.language !== language) {
    return `${plain}: this database holds the ${held.language} Ravenford, not the ${language} one`;
  }
  return (
    `${plain}: this database was seeded by an older fixture revision (its command ${commandId} ` +
    `is a different command); a rerun cannot change it. Reset required: back up, then a fresh ` +
    `database and the seed again; see ${SEED_RESET_PROCEDURE}`
  );
}
