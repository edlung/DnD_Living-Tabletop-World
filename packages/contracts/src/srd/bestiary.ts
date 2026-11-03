import { z } from 'zod';

import { SIDES, squareSchema } from '../combat/battlefield.ts';
import { entityIdSchema } from '../kernel/identifiers.ts';
import { srdIdSchema, type SrdMonster } from './catalog.ts';

/**
 * The DM's bestiary (docs/adr/0053-monsters-as-data.md §3): the SRD's stat blocks to find by name,
 * type or challenge rating, and one added to the campaign — a new creature with that stat block —
 * and, in a running fight, to it on a square.
 */
/** The SRD's fourteen creature types, each with its picture (ADR 0055 §6). */
export const SRD_CREATURE_TYPES = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
] as const;
export type SrdCreatureType = (typeof SRD_CREATURE_TYPES)[number];

/**
 * A stat block's creature type from its line: "Fiend (Devil)" is a fiend, and a swarm is of its
 * members' type ("Swarm of Tiny Beasts", a beast); null for a line that names none.
 */
export function srdCreatureTypeOf(type: string): SrdCreatureType | null {
  const swarm = /^Swarm of \w+ (\w+)$/.exec(type);
  const word = (
    swarm ? (swarm[1] ?? '').replace(/s$/, '') : (/^\w+/.exec(type)?.[0] ?? '')
  ).toLowerCase();
  return SRD_CREATURE_TYPES.find((one) => one === word) ?? null;
}

export interface BestiaryEntry {
  readonly monsterId: string;
  readonly name: string;
  readonly size: string;
  readonly type: string;
  /** Its creature type (`dragon`), for its type's picture (ADR 0055 §6). */
  readonly creatureType: SrdCreatureType | null;
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
  /** Its words' language: Russian once its Russian exists (docs/adr/0055-…md §5). */
  readonly language: 'en' | 'ru';
}

export const addFromBestiaryRequestSchema = z
  .object({
    requestId: z.uuid(),
    /** Its name in the campaign; absent: the stat block's. */
    name: z.string().trim().min(1).max(60).optional(),
    /**
     * Where it stands outside a fight (docs/adr/0058-campaign-content.md §1); absent: where the
     * party is. In a fight it stands at the fight's place.
     */
    locationId: entityIdSchema.optional(),
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
