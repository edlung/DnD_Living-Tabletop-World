import { z } from 'zod';

import { battlefieldSchema, SIDES, squareSchema } from '../combat/commands.ts';
import { ASSET_PURPOSES } from '../assets/commands.ts';
import { CLUE_METHODS } from '../investigation/commands.ts';

/** Local design references, never canonical/player-visible entity IDs. */
export const campaignKeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const text = z.string().trim().max(4000);
const title = z.string().trim().min(1).max(120);
export const campaignConflictSchema = z
  .object({
    key: campaignKeySchema,
    title,
    description: text,
    actors: z.array(campaignKeySchema).max(32),
    stakes: text,
  })
  .strict();
export const campaignSituationSchema = z
  .object({
    key: campaignKeySchema,
    title,
    location: campaignKeySchema,
    description: text,
    hooks: z.array(text).max(20),
    participants: z.array(campaignKeySchema).max(32),
    clueKeys: z.array(campaignKeySchema).max(32),
    approaches: z.array(text).max(20),
    developments: z.array(z.object({ if: text, then: text }).strict()).max(20),
  })
  .strict();
export const campaignClueSchema = z
  .object({
    key: campaignKeySchema,
    entity: campaignKeySchema,
    method: z.enum(CLUE_METHODS),
    dc: z.number().int().min(5).max(30).optional(),
    statement: z.string().trim().min(1).max(2000),
    subjects: z.array(campaignKeySchema).max(16),
  })
  .strict();
export const campaignEncounterSchema = z
  .object({
    key: campaignKeySchema,
    title,
    location: campaignKeySchema,
    trigger: text,
    battlefield: battlefieldSchema,
    combatants: z
      .array(
        z
          .object({
            entity: campaignKeySchema,
            side: z.enum(SIDES),
            position: squareSchema,
          })
          .strict(),
      )
      .min(2)
      .max(16),
  })
  .strict();
export const campaignVisualBriefSchema = z
  .object({
    entity: campaignKeySchema,
    purpose: z.enum(ASSET_PURPOSES),
    description: text,
    style: text,
  })
  .strict();
