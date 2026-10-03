import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { campaignIdSchema } from '@ltw/contracts';
import { actorSchema, submissionsFromScript, type Actor } from '@ltw/domain';
import { z } from 'zod';

/** `fixtures/ravenford/kernel-seed.json`, resolved from both `src/` and `dist/`. */
export const RAVENFORD_SEED_PATH = fileURLToPath(
  new URL('../../../../fixtures/ravenford/kernel-seed.json', import.meta.url),
);

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

export async function loadRavenfordSeed(path = RAVENFORD_SEED_PATH): Promise<RavenfordSeed> {
  const seed = seedSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  const dm: Actor = { actorId: seed.dmActorId, kind: 'user' };
  return {
    campaignId: seed.campaignId,
    dm,
    submissions: submissionsFromScript({
      campaignId: seed.campaignId,
      actor: dm,
      commands: seed.commands,
    }),
  };
}
