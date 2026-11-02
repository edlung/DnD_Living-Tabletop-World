import { z } from 'zod';

import { SIDES, squareSchema } from '../combat/battlefield.ts';
import { srdIdSchema, type SrdMonster } from './catalog.ts';

/**
 * The DM's bestiary (docs/adr/0053-monsters-as-data.md §3): the SRD's stat blocks to find by name,
 * type or challenge rating, and one added to the campaign — a new creature with that stat block —
 * and, in a running fight, to it on a square.
 */
export interface BestiaryEntry {
  readonly monsterId: string;
  readonly name: string;
  readonly size: string;
  readonly type: string;
  readonly challenge: string;
  readonly xp: number;
  readonly armorClass: number;
  readonly hitPoints: number;
}

export interface BestiaryResponse {
  readonly monsters: readonly BestiaryEntry[];
}

export interface BestiaryEntryResponse {
  readonly monster: SrdMonster;
}

export const addFromBestiaryRequestSchema = z
  .object({
    requestId: z.uuid(),
    /** Its name in the campaign; absent: the stat block's. */
    name: z.string().trim().min(1).max(60).optional(),
    /** Into the running fight, on this square, on this side. */
    square: squareSchema.optional(),
    side: z.enum(SIDES).optional(),
  })
  .strict();
export type AddFromBestiaryRequest = z.infer<typeof addFromBestiaryRequestSchema>;

export interface AddedFromBestiaryResponse {
  readonly status: 'added';
  readonly entityId: string;
  /** Whether it joined the running fight. */
  readonly fighting: boolean;
}

export const bestiaryMonsterIdSchema = srdIdSchema;
