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
    /** Given unidentified: its carrier sees what it looks like until it is identified (§5). */
    unidentified: z.literal(true).optional(),
    /** Given to a merchant as wares (docs/adr/0057-encounters-maps-loot.md §8). */
    forSale: z.literal(true).optional(),
  })
  .strict();

const acting = { characterId: entityIdSchema, itemId: entityIdSchema };

export const equipItemCommandSchema = z
  .object({ type: z.literal('EquipItem'), ...acting, slot: z.enum(EQUIP_SLOTS) })
  .strict();
export const unequipItemCommandSchema = z
  .object({ type: z.literal('UnequipItem'), ...acting })
  .strict();
export const useItemCommandSchema = z
  .object({
    type: z.literal('UseItem'),
    ...acting,
    /** A magic item's charges to expend, as its words allow (docs/adr/0054-items-as-data.md §5). */
    charges: z.number().int().min(1).max(10).optional(),
  })
  .strict();
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
 * Merchants (docs/adr/0057-encounters-maps-loot.md §8): the DM makes an NPC a merchant, its prices
 * a factor in percent of the catalog's worth, or a merchant no more (null). What it sells is what
 * it carries; a character here buys a stack or part of one, or sells what it carries unworn, the
 * coins changing hands at once with change made.
 */
export const setMerchantCommandSchema = z
  .object({
    type: z.literal('SetMerchant'),
    npcId: entityIdSchema,
    priceFactor: z.number().int().min(25).max(500).nullable(),
  })
  .strict();
const trading = { ...acting, merchantId: entityIdSchema, quantity: partOfStack };
export const buyItemCommandSchema = z.object({ type: z.literal('BuyItem'), ...trading }).strict();
export const sellItemCommandSchema = z.object({ type: z.literal('SellItem'), ...trading }).strict();

/**
 * Coins shared out (docs/adr/0057-encounters-maps-loot.md §7): the character's coins of each
 * coinage split evenly among the members named — the character too, when named — with change
 * made; what does not divide stays with the character.
 */
export const MAX_SHARERS = 6;
export const splitCoinsCommandSchema = z
  .object({
    type: z.literal('SplitCoins'),
    characterId: entityIdSchema,
    amongIds: z
      .array(entityIdSchema)
      .min(1)
      .max(MAX_SHARERS)
      .refine((ids) => new Set(ids).size === ids.length, 'A member is named once'),
  })
  .strict();

/**
 * Attunement to a magic item (docs/adr/0054-items-as-data.md §5): the DM's, or the table's for a
 * player during a Short Rest. Ending it on a cursed item is the DM's lifting of the curse.
 */
/**
 * An item's properties learnt (docs/adr/0054-items-as-data.md §5): the DM's, or the table's for a
 * player who focused on it in a Short Rest or tasted a potion. Never its curse.
 */
export const identifyItemCommandSchema = z
  .object({ type: z.literal('IdentifyItem'), ...acting })
  .strict();

/**
 * Dawn (docs/adr/0054-items-as-data.md §5): the DM's word that a new day began; every magic item
 * that regains charges at dawn rolls its dice.
 */
export const dawnRechargeCommandSchema = z.object({ type: z.literal('DawnRecharge') }).strict();

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
  'SplitCoins',
  'BuyItem',
  'SellItem',
  'StartCrafting',
  'AbandonCrafting',
] as const;
