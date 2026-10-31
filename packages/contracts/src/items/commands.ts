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

/** Player item commands: issued for the actor's own character (or by the DM/system). */
export const ITEM_PLAYER_COMMAND_TYPES = [
  'EquipItem',
  'UnequipItem',
  'UseItem',
  'GiveItem',
  'DropItem',
  'TakeItem',
] as const;
