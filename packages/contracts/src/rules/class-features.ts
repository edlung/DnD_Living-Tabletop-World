import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import type { SrdBlock } from '../srd/reference.ts';
import type { ClassId } from './character-sheet.ts';

/**
 * The class features a character spends and its rests restore (SRD 5.2.1;
 * docs/adr/0056-characters-from-the-srd.md §4): uses (Rage, Second Wind…) or points (Focus, Sorcery
 * Points, Lay on Hands' pool). The rules count each by the class's level (`@ltw/rules` features).
 */
export const CLASS_RESOURCES = [
  'rage',
  'bardic-inspiration',
  'channel-divinity',
  'wild-shape',
  'second-wind',
  'action-surge',
  'indomitable',
  'focus',
  'lay-on-hands',
  'sorcery-points',
  'innate-sorcery',
  'arcane-recovery',
  'magical-cunning',
] as const;
export type ClassResource = (typeof CLASS_RESOURCES)[number];

/** What a feature's use costs in a fight, and when its rest gives it back. */
export type ResourceCost = 'action' | 'bonus' | 'none' | 'out-of-fight';
export type ResourceRecharge = 'short-one' | 'short-all' | 'long';

/** The expended uses or points of each resource since its rest; absent: none. */
export const featureUsesSchema = z
  .object(
    Object.fromEntries(
      CLASS_RESOURCES.map((resource) => [resource, z.number().int().min(1).max(100)]),
    ) as Record<ClassResource, z.ZodNumber>,
  )
  .partial()
  .strict();
export type FeatureUses = z.infer<typeof featureUsesSchema>;

/** A Barbarian's Rage while it lasts, from the world time (seconds) it began. */
export const ragingSchema = z.object({ since: z.number().int().min(0) }).strict();

/**
 * A Bardic Inspiration die the creature holds (one at a time): its size, the bard who gave it,
 * and the world time (seconds) it lapses, an hour after.
 */
export const inspirationDieSchema = z
  .object({
    sides: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
    fromId: entityIdSchema,
    until: z.number().int().min(0),
  })
  .strict();
export type InspirationDie = z.infer<typeof inspirationDieSchema>;

/** A resource as the sheet shows it: how many are left of how many, and how it comes back. */
export interface ResourceView {
  readonly resource: ClassResource;
  readonly max: number;
  readonly left: number;
  /** Uses, or points spent a number at a time. */
  readonly unit: 'uses' | 'points';
  readonly cost: ResourceCost;
  readonly recharge: ResourceRecharge;
}

/** A feature the character has from a class or its subclass, in the campaign's language. */
export interface CharacterFeatureView {
  readonly classId: ClassId;
  readonly level: number;
  readonly name: string;
  /** From the subclass, not the class. */
  readonly subclass: boolean;
  readonly blocks: readonly SrdBlock[];
  /** The language its words are in: Russian where the translation exists. */
  readonly language: 'en' | 'ru';
  /** The options the character chose of it: its Metamagic, its invocations. */
  readonly chosen?: readonly { readonly name: string; readonly blocks: readonly SrdBlock[] }[];
}

/** GET …/characters/:characterId/features: every feature the character's levels give it. */
export interface CharacterFeaturesResponse {
  readonly perspective: string;
  readonly features: readonly CharacterFeatureView[];
}
