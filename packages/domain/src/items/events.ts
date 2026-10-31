import { EQUIP_SLOTS, entityIdSchema, itemCatalogIdSchema } from '@ltw/contracts';
import { z } from 'zod';

/** Item possession events and undo restores (docs/adr/0039-item-possession.md). */
const slot = z.enum(EQUIP_SLOTS);
const quantity = z.number().int().min(0).max(99);

export const itemGrantedPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    holderId: entityIdSchema,
    catalogId: itemCatalogIdSchema.nullable(),
    quantity: quantity.min(1),
  })
  .strict();

export const itemEquippedPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    holderId: entityIdSchema,
    slot,
    /** Armor class the item adds to the sheet; the sheet changes in the accompanying event. */
    acDelta: z.number().int().min(-40).max(40),
  })
  .strict();

export const itemUnequippedPayloadSchema = z
  .object({
    itemId: entityIdSchema,
    holderId: entityIdSchema,
    slot,
    acDelta: z.number().int().min(-40).max(40),
  })
  .strict();

/** One unit of a stack, or a single item, is used up. */
export const itemUsedPayloadSchema = z
  .object({ itemId: entityIdSchema, holderId: entityIdSchema, remaining: quantity })
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
