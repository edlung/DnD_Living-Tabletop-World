import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import type { EntityRef } from '../knowledge/views.ts';
import { srdIdSchema } from '../srd/catalog.ts';
import { MAX_COMBATANTS, battlefieldSchema, squareSchema } from './commands.ts';
import type { PreparedEncounterBlock } from './prepared.ts';

/**
 * The DM's own encounters (docs/adr/0057-encounters-maps-loot.md §1): built from the bestiary and
 * the campaign's creatures, saved beside the world for the DM alone, and started in one step
 * through the World Engine. A bestiary foe is made afresh each time the encounter starts.
 */
export const MAX_SAVED_ENCOUNTERS = 60;

export const savedFoeSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('bestiary'), monsterId: srdIdSchema, position: squareSchema })
    .strict(),
  z
    .object({ kind: z.literal('creature'), entityId: entityIdSchema, position: squareSchema })
    .strict(),
]);
export type SavedFoe = z.infer<typeof savedFoeSchema>;

/** `POST …/encounters/saved/:encounterId`: the encounter as the DM built it, new or changed. */
export const savedEncounterRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    locationId: entityIdSchema,
    battlefield: battlefieldSchema,
    foes: z
      .array(savedFoeSchema)
      .min(1)
      .max(MAX_COMBATANTS - 1),
    /** Where the party's characters at the place start, in order: as many as can join. */
    partyStart: z.array(squareSchema).min(1).max(8),
  })
  .strict();
export type SavedEncounterRequest = z.infer<typeof savedEncounterRequestSchema>;

/** The fight's difficulty for the party (docs/adr/0053-monsters-as-data.md §3). */
export interface EncounterDifficultyView {
  readonly xp: number;
  /** Foes whose stat block names no XP. */
  readonly unknown: number;
  readonly budget: { readonly low: number; readonly moderate: number; readonly high: number };
  readonly rating: 'low' | 'moderate' | 'high' | 'beyond';
}

/** One foe as the builder shows it: its name, its challenge and where it stands. */
export interface SavedFoeView {
  readonly foe: SavedFoe;
  readonly name: string;
  readonly challenge: string | null;
  readonly xp: number | null;
  readonly size: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
}

/**
 * Why a saved encounter cannot start now: a prepared one's reasons, or `gone` — its place or one of
 * its creatures is no longer in the campaign, so it can only be changed or deleted.
 */
export type SavedEncounterBlock = PreparedEncounterBlock | 'gone';

export interface SavedEncounterView {
  readonly encounterId: string;
  readonly name: string;
  /** Null when the place is no longer in the campaign. */
  readonly location: EntityRef | null;
  readonly battlefield: z.infer<typeof battlefieldSchema>;
  readonly foes: readonly SavedFoeView[];
  readonly partyStart: readonly z.infer<typeof squareSchema>[];
  /** The party's characters at the place now: they join, in order. */
  readonly party: readonly EntityRef[];
  /** For the party at the place now; null when none is there. */
  readonly difficulty: EncounterDifficultyView | null;
  readonly blocked: SavedEncounterBlock | null;
  readonly updatedAt: string;
}

/** `GET /campaigns/:campaignId/encounters/saved` (DM only). */
export interface SavedEncountersResponse {
  readonly encounters: readonly SavedEncounterView[];
}

/** `POST …/encounters/difficulty`: the difficulty of foes for the party at a place, as it is built. */
export const encounterDifficultyRequestSchema = z
  .object({
    locationId: entityIdSchema,
    foes: z.array(savedFoeSchema).max(MAX_COMBATANTS - 1),
  })
  .strict();

export interface EncounterDifficultyResponse {
  readonly party: readonly EntityRef[];
  readonly foes: readonly SavedFoeView[];
  readonly difficulty: EncounterDifficultyView | null;
}
