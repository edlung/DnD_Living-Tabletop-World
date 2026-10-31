import { z } from 'zod';

/**
 * Item catalog entries (docs/adr/0039-item-possession.md). A catalog entry
 * describes a kind of thing; it never claims to be a particular world object.
 * Content is original to the Ravenford setting, not derived from the SRD.
 */
export const ITEM_CATEGORIES = ['armor', 'shield', 'weapon', 'consumable', 'gear', 'tool'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const EQUIP_SLOTS = [
  'mainhand',
  'offhand',
  'body',
  'head',
  'hands',
  'feet',
  'cloak',
  'neck',
  'ring',
] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/** A catalog ID: a stable ASCII slug, never renamed or reused after release. */
export const itemCatalogIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'must be a lowercase ASCII slug')
  .max(48);

/** What using a consumable does. A closed union; the DM narrates anything else. */
export const itemEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heal'), amount: z.number().int().min(1).max(100) }).strict(),
  z.object({ kind: z.literal('removeCondition'), condition: z.enum(['prone', 'slowed']) }).strict(),
  z.object({ kind: z.literal('narrative') }).strict(),
]);
export type ItemEffect = z.infer<typeof itemEffectSchema>;

const localized = z
  .object({ ru: z.string().min(1).max(80), en: z.string().min(1).max(80) })
  .strict();
const localizedText = z
  .object({ ru: z.string().min(1).max(240), en: z.string().min(1).max(240) })
  .strict();

export const itemEntrySchema = z
  .object({
    itemId: itemCatalogIdSchema,
    category: z.enum(ITEM_CATEGORIES),
    name: localized,
    description: localizedText,
    weightLb: z.number().min(0).max(500),
    valueCp: z.number().int().min(0).max(10_000_000),
    stackable: z.boolean(),
    slots: z.array(z.enum(EQUIP_SLOTS)).max(2),
    /** Body armor: AC = baseAc + Dexterity modifier capped at dexCap (null = uncapped). */
    armor: z
      .object({
        baseAc: z.number().int().min(10).max(20),
        dexCap: z.number().int().min(0).max(5).nullable(),
      })
      .strict()
      .optional(),
    /** Shield: AC bonus while carried in the offhand. */
    shieldBonus: z.number().int().min(1).max(3).optional(),
    effect: itemEffectSchema.optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    const issue = (message: string) => {
      context.addIssue({ code: 'custom', message });
    };
    if (entry.category === 'armor' && (!entry.armor || !entry.slots.includes('body')))
      issue('armor needs an armor block and the body slot');
    if (entry.category !== 'armor' && entry.armor) issue('only armor has an armor block');
    if (
      entry.category === 'shield' &&
      (entry.shieldBonus === undefined || !entry.slots.includes('offhand'))
    )
      issue('a shield needs a bonus and the offhand slot');
    if (entry.category !== 'shield' && entry.shieldBonus !== undefined)
      issue('only a shield has a shield bonus');
    if (entry.category === 'consumable' && !entry.effect) issue('a consumable needs an effect');
    if (entry.category !== 'consumable' && entry.effect) issue('only a consumable has an effect');
    if (entry.category === 'consumable' && entry.slots.length > 0)
      issue('a consumable is not equipped');
    if (entry.stackable && entry.slots.length > 0) issue('a stackable item is not equipped');
  });
export type ItemEntry = z.infer<typeof itemEntrySchema>;
