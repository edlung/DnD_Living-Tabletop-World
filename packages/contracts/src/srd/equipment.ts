import { z } from 'zod';

import { srdIdSchema } from './catalog.ts';

/**
 * The SRD's equipment as its Equipment chapter gives it (docs/adr/0054-items-as-data.md §1–2): a
 * thing's name, price, weight and words, and its table row — a weapon's damage, properties and
 * mastery, an armor's Armor Class, Strength and Stealth, a tool's ability, use and crafts, an
 * ammunition's bundle. English, read only; the catalog's entries the World Engine applies are
 * `@ltw/contracts/srd-items`.
 */
export const SRD_EQUIPMENT_KINDS = [
  'coin',
  'weapon',
  'armor',
  'shield',
  'tool',
  'gear',
  'ammunition',
  'focus',
  'pack',
  'tack',
  'food',
] as const;
export type SrdEquipmentKind = (typeof SRD_EQUIPMENT_KINDS)[number];

const words = z.string().min(1).max(400);

export const srdEquipmentSchema = z
  .object({
    itemId: srdIdSchema,
    name: z.string().min(1).max(80),
    kind: z.enum(SRD_EQUIPMENT_KINDS),
    /** In copper pieces; null where the SRD writes "Varies". */
    costCp: z.number().min(0).nullable(),
    /** In pounds; null where it writes "—". */
    weightLb: z.number().min(0).nullable(),
    /** Its words; empty where its table row says all. */
    text: z.string().max(8000),
    weapon: z
      .object({
        category: z.enum(['simple', 'martial']),
        melee: z.boolean(),
        damage: z.string().regex(/^(\d+d\d+|\d+)$/),
        damageType: z.enum(['bludgeoning', 'piercing', 'slashing']),
        properties: z.array(words).max(8),
        mastery: z.string().regex(/^[a-z]+$/),
      })
      .strict()
      .optional(),
    armor: z
      .object({
        category: z.enum(['light', 'medium', 'heavy', 'shield']),
        armorClass: z.number().int().min(1).max(20),
        dexCap: z.number().int().min(0).max(2).nullable(),
        strength: z.number().int().min(1).max(20).nullable(),
        stealthDisadvantage: z.boolean(),
      })
      .strict()
      .optional(),
    tool: z
      .object({ ability: z.string().min(1).max(20), utilize: words, craft: words.nullable() })
      .strict()
      .optional(),
    /** Ammunition: how many a bundle holds, and what holds them. */
    bundle: z
      .object({ amount: z.number().int().min(1).max(100), storage: z.string().min(1).max(20) })
      .strict()
      .optional(),
  })
  .strict();
export type SrdEquipment = z.infer<typeof srdEquipmentSchema>;
