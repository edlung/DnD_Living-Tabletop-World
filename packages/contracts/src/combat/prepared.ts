import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import type { EntityRef } from '../knowledge/views.ts';
import { MAX_COMBATANTS, battlefieldSchema, squareSchema } from './commands.ts';

/**
 * Prepared encounters (Stage 605): a fight the adventure has ready at a place — its battlefield,
 * its foes where they stand, and where the party starts. The DM starts one in a single step: the
 * foes are placed, then `StartCombat` runs with the party there (docs/adr/0015-combat-engine.md,
 * 2026-11-02 amendment). Content, not state, like quest definitions.
 */
export const preparedEncounterSchema = z
  .object({
    encounterId: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(60),
    title: z.string().trim().min(1).max(120),
    /** What the DM is about to start, in a sentence or two. */
    summary: z.string().trim().min(1).max(400),
    locationId: entityIdSchema,
    battlefield: battlefieldSchema,
    foes: z
      .array(z.object({ entityId: entityIdSchema, position: squareSchema }).strict())
      .min(1)
      .max(MAX_COMBATANTS - 1),
    /** Where the party's characters start, in order: as many as can join. */
    partyStart: z.array(squareSchema).min(1).max(8),
  })
  .strict();
export type PreparedEncounter = z.infer<typeof preparedEncounterSchema>;

export const preparedEncounterBookSchema = z
  .object({ $comment: z.string().optional(), encounters: z.array(preparedEncounterSchema) })
  .strict();

/** Why a prepared encounter cannot start now. */
export type PreparedEncounterBlock = 'in-combat' | 'no-foes' | 'no-party';

/** One prepared encounter as the DM sees it. */
export interface PreparedEncounterView {
  readonly encounterId: string;
  readonly title: string;
  readonly summary: string;
  readonly location: EntityRef;
  /** Foes who can still fight. */
  readonly foes: number;
  /** The party's characters at the place now: they join, in order. */
  readonly party: readonly EntityRef[];
  readonly blocked: PreparedEncounterBlock | null;
}

/** `GET /campaigns/:campaignId/encounters/prepared` (DM only). */
export interface PreparedEncounterListResponse {
  readonly encounters: readonly PreparedEncounterView[];
}

/** Who is surprised as a fight starts (docs/adr/0045-conditions-and-actions.md §5). */
export const SURPRISED_SIDES = ['party', 'foes'] as const;
export type SurprisedSide = (typeof SURPRISED_SIDES)[number];

/**
 * `POST /campaigns/:campaignId/encounters/prepared/:encounterId/start` (DM only); `surprised`:
 * that side rolls Initiative with Disadvantage.
 */
export const startPreparedEncounterRequestSchema = z
  .object({ requestId: z.uuid(), surprised: z.enum(SURPRISED_SIDES).optional() })
  .strict();

export interface StartedPreparedEncounterResponse {
  readonly status: 'started';
  readonly encounterId: string;
}
