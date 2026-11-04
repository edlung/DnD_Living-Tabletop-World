import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import type { EntityRef } from '../knowledge/views.ts';
import { srdIdSchema } from '../srd/catalog.ts';
import { itemCatalogIdSchema } from './schema.ts';

/**
 * Crafting (docs/adr/0057-encounters-maps-loot.md §9; SRD 5.2.1 "Crafting Nonmagical Items",
 * "Brewing Potions of Healing", "Scribing Spell Scrolls"). A character proficient with the tool an
 * item is made with, and carrying it, starts a project: the materials, half the item's cost, are
 * paid at once; the work takes its cost in GP ÷ 10 days of 8 hours, a day of each one working on
 * it counted. A spellcaster scribes a Spell Scroll of a spell it has prepared. The DM gives the
 * days of work (downtime); the finished thing appears in the crafter's pack. Shapes only; the
 * World Engine decides.
 */

/** A day's work (SRD 5.2.1). */
export const CRAFT_DAY_HOURS = 8;
/** Things of one kind made in one project: a stack's worth. */
export const MAX_CRAFT_QUANTITY = 50;
/** Days of downtime the DM gives at once. */
export const MAX_DOWNTIME_DAYS = 60;
/** Helpers the campaign may allow on one project (one, as the SRD has it, by default). */
export const MAX_CRAFT_HELPERS = 4;
/** Projects running at once in a campaign. */
export const MAX_CRAFT_PROJECTS = 12;

/** The tool a Spell Scroll is scribed with, beside proficiency in Arcana (SRD 5.2.1). */
export const SCRIBING_TOOL = 'srd-calligraphers-supplies';

/**
 * Scribing a Spell Scroll by the spell's level, a cantrip first (SRD 5.2.1 "Spell Scroll Costs"):
 * the days and the cost in copper.
 */
export const SPELL_SCROLL_COSTS: readonly { readonly days: number; readonly costCp: number }[] = [
  { days: 1, costCp: 1_500 },
  { days: 1, costCp: 2_500 },
  { days: 3, costCp: 10_000 },
  { days: 5, costCp: 15_000 },
  { days: 10, costCp: 100_000 },
  { days: 25, costCp: 150_000 },
  { days: 40, costCp: 1_000_000 },
  { days: 50, costCp: 1_250_000 },
  { days: 60, costCp: 1_500_000 },
  { days: 120, costCp: 5_000_000 },
];

/** The scroll a spell of a level is scribed on: the SRD's own gear up to level 1, else the magic item. */
export const scrollCatalogId = (level: number): string =>
  level === 0
    ? 'srd-spell-scroll-cantrip'
    : level === 1
      ? 'srd-spell-scroll-level-1'
      : 'srd-spell-scroll';

/** Days and materials of a made thing by the SRD's rule: cost ÷ 10 GP a day, half the cost. */
export function craftCost(
  valueCp: number,
  quantity: number,
  craft?: { readonly days?: number | undefined; readonly materialsCp?: number | undefined },
): { readonly days: number; readonly materialsCp: number } {
  const worth = valueCp * quantity;
  return {
    days: craft?.days === undefined ? Math.max(1, Math.ceil(worth / 1_000)) : craft.days * quantity,
    materialsCp:
      craft?.materialsCp === undefined ? Math.floor(worth / 2) : craft.materialsCp * quantity,
  };
}

const helperIds = z
  .array(entityIdSchema)
  .max(MAX_CRAFT_HELPERS)
  .refine((ids) => new Set(ids).size === ids.length, 'A helper is named once');

/** A project begun: a thing from the catalog, or a Spell Scroll of a prepared spell. */
export const startCraftingCommandSchema = z
  .object({
    type: z.literal('StartCrafting'),
    characterId: entityIdSchema,
    catalogId: itemCatalogIdSchema.optional(),
    spellId: srdIdSchema.optional(),
    quantity: z.number().int().min(1).max(MAX_CRAFT_QUANTITY).default(1),
    helperIds: helperIds.default([]),
  })
  .strict()
  .refine(
    (command) => (command.catalogId === undefined) !== (command.spellId === undefined),
    'A project makes a thing from the catalog or scribes a spell',
  );

/** A project given up: the materials are spent. */
export const abandonCraftingCommandSchema = z
  .object({
    type: z.literal('AbandonCrafting'),
    characterId: entityIdSchema,
    projectId: entityIdSchema,
  })
  .strict();

/** The DM's days of downtime: every running project, or the one named, worked that many days. */
export const workDowntimeCommandSchema = z
  .object({
    type: z.literal('WorkDowntime'),
    days: z.number().int().min(1).max(MAX_DOWNTIME_DAYS),
    projectId: entityIdSchema.optional(),
  })
  .strict();

/** A project as its viewer sees it. */
export interface CraftProjectView {
  readonly projectId: string;
  readonly crafter: EntityRef;
  readonly helpers: readonly EntityRef[];
  /** What it makes, in the campaign's language ("Spell Scroll (Level 1): Cure Wounds"). */
  readonly name: string;
  readonly quantity: number;
  /** Hours of work it needs, and has had (a day of each worker is 8 hours). */
  readonly hoursNeeded: number;
  readonly hoursDone: number;
  /** The crafter and its helpers. */
  readonly workers: number;
}

/** A thing a character can make now: its tool at hand and its proficiency. */
export interface CraftRecipeView {
  readonly catalogId: string;
  readonly name: string;
  /** The tool it is made with, by catalog id and name. */
  readonly toolId: string;
  readonly toolName: string;
  /** For one of it. */
  readonly days: number;
  readonly materialsCp: number;
  readonly stackable: boolean;
}

/** A spell a character can scribe now, with its scroll's days and cost. */
export interface CraftScrollView {
  readonly spellId: string;
  readonly name: string;
  readonly level: number;
  readonly days: number;
  readonly costCp: number;
}

export interface CraftingResponse {
  readonly perspective: string;
  /** The projects the viewer may see: the DM every one, a character its own and those it helps. */
  readonly projects: readonly CraftProjectView[];
  /** For a character: what it can make and scribe, who may help with which tool, its coins. */
  readonly recipes: readonly CraftRecipeView[];
  readonly scrolls: readonly CraftScrollView[];
  readonly helpers: readonly {
    readonly entity: EntityRef;
    readonly toolIds: readonly string[];
    /** On a project already. */
    readonly busy: boolean;
  }[];
  /** Helpers the campaign allows on a project. */
  readonly maxHelpers: number;
  /** Whether the character works on a project already (one at a time). */
  readonly busy: boolean;
  readonly purseCp: number;
  /** The character's home coinage (`COINAGES` index): prices are said in it. */
  readonly coinage: number;
}
