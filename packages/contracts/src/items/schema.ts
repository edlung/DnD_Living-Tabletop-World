import { z } from 'zod';

import { AMMUNITION_KINDS, WEAPON_IDS } from '../rules/character-sheet.ts';

/**
 * Item catalog entries (docs/adr/0039-item-possession.md). A catalog entry
 * describes a kind of thing; it never claims to be a particular world object.
 * Ravenford's entries are its own; the SRD's equipment and magic items join
 * them (`source: 'srd'`, docs/adr/0054-items-as-data.md).
 */
export const ITEM_CATEGORIES = [
  'armor',
  'shield',
  'weapon',
  'consumable',
  'gear',
  'tool',
  'coins',
] as const;
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
  .max(64);

/** What using a consumable does. A closed union; the DM narrates anything else. */
export const itemEffectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('heal'), amount: z.number().int().min(1).max(100) }).strict(),
  /** Hit points by dice: a Potion of Healing's 2d4 + 2 (docs/adr/0054-items-as-data.md §5). */
  z
    .object({
      kind: z.literal('heal-dice'),
      count: z.number().int().min(1).max(20),
      sides: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
      bonus: z.number().int().min(0).max(40),
    })
    .strict(),
  z.object({ kind: z.literal('removeCondition'), condition: z.enum(['prone', 'slowed']) }).strict(),
  z.object({ kind: z.literal('narrative') }).strict(),
]);
export type ItemEffect = z.infer<typeof itemEffectSchema>;

/** A magic item's rarity (SRD 5.2.1); `varies` where its kinds differ. */
export const ITEM_RARITIES = [
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
  'varies',
] as const;

/** The looks an item's kind picture shows (docs/adr/0055-rules-reference-and-toolbox.md §6). */
export const ITEM_LOOKS = [
  'melee-weapon',
  'ranged-weapon',
  'armor',
  'shield',
  'ammunition',
  'potion',
  'scroll',
  'wand',
  'staff',
  'rod',
  'ring',
  'wondrous',
  'tool',
  'gear',
  'pack',
  'coins',
  'focus',
  'food',
  'tack',
] as const;
export type ItemLook = (typeof ITEM_LOOKS)[number];
export type ItemRarity = (typeof ITEM_RARITIES)[number];

/**
 * What makes a catalog entry magic (docs/adr/0054-items-as-data.md §5): its rarity, whether it
 * needs attunement and by whom, the bonuses it gives, its charges, a curse, the SRD text it
 * follows (`text`, an SRD id), and, for a magic weapon, armor, shield or ammunition, the mundane
 * kinds it may be made on — the item names its base when it is given.
 */
export const itemMagicSchema = z
  .object({
    rarity: z.enum(ITEM_RARITIES),
    /** Null: none needed; "": anyone; else who may ("by a Wizard"). */
    attunement: z.string().max(120).nullable(),
    bonus: z
      .object({
        attack: z.number().int().min(1).max(3).optional(),
        damage: z.number().int().min(1).max(3).optional(),
        armorClass: z.number().int().min(1).max(3).optional(),
        saves: z.number().int().min(1).max(3).optional(),
      })
      .strict()
      .optional(),
    charges: z
      .object({
        max: z.number().int().min(1).max(50),
        /** Regained at dawn: "1d6 + 1", as dice; null: never. */
        regain: z
          .object({
            count: z.number().int().min(0).max(10),
            sides: z.number().int().min(1).max(20),
            bonus: z.number().int().min(0).max(20),
          })
          .strict()
          .nullable(),
      })
      .strict()
      .optional(),
    cursed: z.literal(true).optional(),
    base: z
      .object({
        kind: z.enum(['weapon', 'armor', 'shield', 'ammunition']),
        /** The catalog ids it may be made on. */
        allowed: z.array(z.string().min(1).max(64)).min(1).max(60),
      })
      .strict()
      .optional(),
    /** The SRD text it follows (an id of `@ltw/rules` magic items). */
    text: z.string().min(1).max(80),
  })
  .strict();
export type ItemMagic = z.infer<typeof itemMagicSchema>;

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
    weightLb: z.number().min(0).max(2000),
    /** In copper pennies, to the hundredth: a sling bullet is a fifth of one (SRD 5.2.1). */
    valueCp: z
      .number()
      .min(0)
      .max(100_000_000)
      .refine(
        (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
        'to the hundredth',
      ),
    stackable: z.boolean(),
    slots: z.array(z.enum(EQUIP_SLOTS)).max(2),
    /**
     * Body armor: AC = baseAc + Dexterity modifier capped at dexCap (null = uncapped); the Strength
     * it asks, and Disadvantage on Stealth (docs/adr/0050-the-world-around.md §10).
     */
    armor: z
      .object({
        baseAc: z.number().int().min(10).max(20),
        dexCap: z.number().int().min(0).max(5).nullable(),
        strength: z.number().int().min(1).max(30).optional(),
        stealthDisadvantage: z.literal(true).optional(),
      })
      .strict()
      .optional(),
    /** Shield: AC bonus while carried in the offhand. */
    shieldBonus: z.number().int().min(1).max(3).optional(),
    /** Weapon: the rules weapon it fights as (Stage 520; `@ltw/rules` WEAPONS). */
    weapon: z.enum(WEAPON_IDS).optional(),
    /** Ammunition: the kind a weapon fires, a unit spent by each shot (docs/adr/0047-weapons.md §5). */
    ammunition: z.enum(AMMUNITION_KINDS).optional(),
    effect: itemEffectSchema.optional(),
    /** The SRD's (docs/adr/0054-items-as-data.md §2); absent for Ravenford's own. */
    source: z.literal('srd').optional(),
    /** A magic item (docs/adr/0054-items-as-data.md §5). */
    magic: itemMagicSchema.optional(),
    /** Its Russian words are still the English ones (the translation comes with Stage 650e). */
    untranslated: z.literal(true).optional(),
    /**
     * What it looks like, for its kind's picture until it has its own (docs/adr/0055-rules-reference-
     * and-toolbox.md §6); an SRD entry's.
     */
    look: z.enum(ITEM_LOOKS).optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    const issue = (message: string) => {
      context.addIssue({ code: 'custom', message });
    };
    // A magic weapon, armor or shield is made on a base: its armor, weapon and slots are the base's.
    const made = entry.magic?.base !== undefined;
    if (
      made &&
      (entry.armor ?? entry.weapon ?? entry.shieldBonus ?? entry.ammunition) !== undefined
    )
      issue('an entry made on a base takes its armor, weapon and ammunition from it');
    if (!made && entry.category === 'armor' && (!entry.armor || !entry.slots.includes('body')))
      issue('armor needs an armor block and the body slot');
    if (entry.category !== 'armor' && entry.armor) issue('only armor has an armor block');
    if (
      !made &&
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
    if (
      !made &&
      entry.category === 'weapon' &&
      (!entry.weapon || !entry.slots.includes('mainhand'))
    )
      issue('a weapon names its rules weapon and goes in the main hand');
    if (entry.ammunition !== undefined && (entry.category !== 'gear' || !entry.stackable))
      issue('ammunition is stackable gear');
    if (entry.category !== 'weapon' && entry.weapon) issue('only a weapon names a rules weapon');
    if (entry.category === 'coins' && (!entry.stackable || entry.slots.length > 0))
      issue('coins stack and are not worn');
  });
export type ItemEntry = z.infer<typeof itemEntrySchema>;

/**
 * Light, medium or heavy body armor, by how much Dexterity it lets count (SRD 5.2.1;
 * docs/adr/0050-the-world-around.md §8, §10): all of it, some, none.
 */
export const armorWeight = (dexCap: number | null): 'light' | 'medium' | 'heavy' =>
  dexCap === null ? 'light' : dexCap > 0 ? 'medium' : 'heavy';
