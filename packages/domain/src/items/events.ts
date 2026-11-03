import { EQUIP_SLOTS, entityIdSchema, itemCatalogIdSchema } from '@ltw/contracts';
import { z } from 'zod';

/** Item possession events and undo restores (docs/adr/0039-item-possession.md). */
const slot = z.enum(EQUIP_SLOTS);
const quantity = z.number().int().min(0).max(99);

export const itemGrantedPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    /** Null: treasure granted to a place, lying there (docs/adr/0057-encounters-maps-loot.md §7). */
    holderId: entityIdSchema.nullable(),
    catalogId: itemCatalogIdSchema.nullable(),
    quantity: quantity.min(1),
    /** What a magic weapon, armor or shield is made on (docs/adr/0054-items-as-data.md §5). */
    baseCatalogId: itemCatalogIdSchema.optional(),
    /** A magic item's charges, full (§5). */
    charges: z.number().int().min(0).max(50).optional(),
    /** Given unidentified (§5). */
    unidentified: z.literal(true).optional(),
  })
  .strict();

/** A magic item's charges expended (docs/adr/0054-items-as-data.md §5): `left` of them after. */
export const itemChargesSpentPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    holderId: entityIdSchema,
    spent: z.number().int().min(1).max(10),
    left: z.number().int().min(0).max(50),
  })
  .strict();

/** At dawn, a magic item's charges come back by its dice (§5): `charges` of them after. */
export const itemChargesRegainedPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    holderId: entityIdSchema.nullable(),
    rolls: z.array(z.number().int().min(1).max(20)).max(10),
    regained: z.number().int().min(0).max(50),
    charges: z.number().int().min(0).max(50),
  })
  .strict();

/** An item's properties learnt by its carrier (§5); never its curse. */
export const itemIdentifiedPayloadSchema = z
  .object({ itemId: entityIdSchema, holderId: entityIdSchema })
  .strict();

export const itemEquippedPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    holderId: entityIdSchema,
    slot,
    /** Armor class the item adds to the sheet; the sheet changes in the accompanying event. */
    acDelta: z.number().int().min(-40).max(40),
    /** What it adds to saving throws: a Ring of Protection's +1 (ADR 0054 §5). */
    saveDelta: z.number().int().min(-10).max(10).optional(),
  })
  .strict();

export const itemUnequippedPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    holderId: entityIdSchema,
    slot,
    acDelta: z.number().int().min(-40).max(40),
    saveDelta: z.number().int().min(-10).max(10).optional(),
  })
  .strict();

/**
 * Attunement begun or ended (docs/adr/0054-items-as-data.md §5): the Armor Class and saves the item
 * gives its wearer from now on (the sheet changes in the accompanying event).
 */
export const itemAttunedPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    holderId: entityIdSchema,
    attuned: z.boolean(),
    acDelta: z.number().int().min(-40).max(40),
    saveDelta: z.number().int().min(-10).max(10),
    /** Ended on a cursed item: the DM lifted the curse. */
    liftedCurse: z.literal(true).optional(),
  })
  .strict();

/** One unit of a stack, or a single item, is used up. */
export const itemUsedPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    holderId: entityIdSchema,
    remaining: quantity,
    /** A potion's dice and the hit points they gave (docs/adr/0054-items-as-data.md §5). */
    healed: z
      .object({
        rolls: z.array(z.number().int().min(1).max(12)).min(1).max(20),
        bonus: z.number().int().min(0).max(40),
        total: z.number().int().min(1).max(300),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Units come back to a stack: ammunition picked up after a fight (docs/adr/0047-weapons.md §5),
 * `recovered` of them, the stack holding `quantity` after.
 */
export const itemRecoveredPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    holderId: entityIdSchema,
    recovered: quantity.min(1),
    quantity,
  })
  .strict();

/**
 * Part of a stack becomes an item of its own, held by the same holder: a new item entity (made by
 * `EntityCreated` just before) takes `quantity` units from `itemId`, which keeps the rest.
 */
export const itemSplitPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    newItemId: entityIdSchema,
    holderId: entityIdSchema,
    quantity: quantity.min(1),
  })
  .strict();

/** A change of carrier: `from` null = picked up, `to` null = dropped. */
export const itemTransferredPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    from: entityIdSchema.nullable(),
    to: entityIdSchema.nullable(),
    /** Used only to create the record when a placed world item is first picked up. */
    catalogId: itemCatalogIdSchema.nullable(),
    quantity: quantity.min(1),
  })
  .strict();

const possessionValue = z
  .object({
    catalogId: itemCatalogIdSchema.nullable(),
    holderId: entityIdSchema.nullable(),
    quantity,
    slot: slot.nullable(),
    acDelta: z.number().int().min(-40).max(40),
    baseCatalogId: itemCatalogIdSchema.optional(),
    attuned: z.literal(true).optional(),
    saveDelta: z.number().int().min(-10).max(10).optional(),
    charges: z.number().int().min(0).max(50).optional(),
    unidentified: z.literal(true).optional(),
  })
  .strict();

/** The possession before the undone change; null when the item had none. */
export const itemRestoreSchemas = [
  z
    .object({
      fact: z.literal('possession'),
      itemId: entityIdSchema,
      /** The holder whose worn set the change touched, if any. */
      holderId: entityIdSchema.nullable(),
      value: possessionValue.nullable(),
    })
    .strict(),
] as const;
