import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { campaignIdSchema } from '@ltw/contracts';
import { actorSchema, submissionsFromScript, type Actor } from '@ltw/domain';
import { z } from 'zod';

/** `fixtures/ravenford/`, resolved from both `src/` and `dist/`. */
export const RAVENFORD_FIXTURES_DIR = fileURLToPath(
  new URL('../../../../fixtures/ravenford/', import.meta.url),
);

/**
 * Seed scripts in order, each with its command-ID prefix. Prefixes are part
 * of seeded history (idempotency keys): never rename them.
 */
const SEED_FILES = [
  { file: 'kernel-seed.json', prefix: 'seed' },
  { file: 'knowledge-seed.json', prefix: 'knowledge' },
  { file: 'memory-seed.json', prefix: 'memory' },
] as const;

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

export async function loadRavenfordSeed(
  directory = RAVENFORD_FIXTURES_DIR,
): Promise<RavenfordSeed> {
  const scripts = await Promise.all(
    SEED_FILES.map(async ({ file, prefix }) => ({
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
    throw new Error('Ravenford seed files disagree on campaign or DM');
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
