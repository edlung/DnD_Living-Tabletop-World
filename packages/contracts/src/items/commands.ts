import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import { EQUIP_SLOTS, itemCatalogIdSchema } from './schema.ts';

/**
 * Item possession commands (docs/adr/0039-item-possession.md). The item is a
 * world entity of kind `item`; possession is who carries it. Shapes only;
 * legality is decided by the World Engine.
 */
export const grantItemCommandSchema = z
  .object({
    type: z.literal('GrantItem'),
    itemId: entityIdSchema,
    holderId: entityIdSchema,
    /** The catalog entry this item is an instance of; absent for a unique story object. */
    catalogId: itemCatalogIdSchema.optional(),
    /**
     * What a magic weapon, armor, shield or ammunition is made on: one of the catalog ids its
     * entry allows; absent when it allows only one (docs/adr/0054-items-as-data.md §5).
     */
    baseCatalogId: itemCatalogIdSchema.optional(),
    quantity: z.number().int().min(1).max(99).default(1),
  })
  .strict();

const acting = { characterId: entityIdSchema, itemId: entityIdSchema };

export const equipItemCommandSchema = z
  .object({ type: z.literal('EquipItem'), ...acting, slot: z.enum(EQUIP_SLOTS) })
  .strict();
export const unequipItemCommandSchema = z
  .object({ type: z.literal('UnequipItem'), ...acting })
  .strict();
export const useItemCommandSchema = z.object({ type: z.literal('UseItem'), ...acting }).strict();
/** Part of a stack: absent means everything the holder has of it. */
const partOfStack = z.number().int().min(1).max(99).optional();

export const giveItemCommandSchema = z
  .object({
    type: z.literal('GiveItem'),
    ...acting,
    toHolderId: entityIdSchema,
    quantity: partOfStack,
  })
  .strict();
export const dropItemCommandSchema = z
  .object({ type: z.literal('DropItem'), ...acting, quantity: partOfStack })
  .strict();
export const takeItemCommandSchema = z.object({ type: z.literal('TakeItem'), ...acting }).strict();

/**
 * Attunement to a magic item (docs/adr/0054-items-as-data.md §5): the DM's, or the table's for a
 * player during a Short Rest. Ending it on a cursed item is the DM's lifting of the curse.
 */
export const attuneItemCommandSchema = z
  .object({
    type: z.literal('AttuneItem'),
    ...acting,
    attuned: z.boolean(),
    liftCurse: z.literal(true).optional(),
  })
  .strict();

/** Player item commands: issued for the actor's own character (or by the DM/system). */
export const ITEM_PLAYER_COMMAND_TYPES = [
  'EquipItem',
  'UnequipItem',
  'UseItem',
  'GiveItem',
  'DropItem',
  'TakeItem',
] as const;
