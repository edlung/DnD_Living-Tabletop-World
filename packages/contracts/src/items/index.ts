/**
 * Items (docs/adr/0039-item-possession.md, docs/adr/0054-items-as-data.md): the catalog and its
 * schema, the item commands, coins, and the views of the pack and a merchant's shop. The SRD's
 * catalog entries stay behind their own entry point (`@ltw/contracts/srd-items`).
 */
export {
  EQUIP_SLOTS,
  ITEM_CATEGORIES,
  armorWeight,
  itemCatalogIdSchema,
  ITEM_LOOKS,
  ITEM_RARITIES,
  itemEffectSchema,
  itemEntrySchema,
  itemMagicSchema,
  type EquipSlot,
  type ItemCategory,
  type ItemEffect,
  type ItemEntry,
  type ItemLook,
  type ItemMagic,
  type ItemRarity,
} from './schema.ts';
export { ITEM_CATALOG, catalogEntry, isCatalogItemId } from './catalog.ts';
export {
  attuneRequestSchema,
  catalogItemIdSchema,
  identifyRequestSchema,
  type IdentifiedResponse,
  giveCatalogItemRequestSchema,
  type AttuneRequest,
  type AttunedResponse,
  type GiveCatalogItemRequest,
  type GivenCatalogItemResponse,
  type ItemCatalogEntryResponse,
  type ItemCatalogListing,
  type ItemCatalogResponse,
} from './catalog-api.ts';
export {
  ITEM_PLAYER_COMMAND_TYPES,
  dropItemCommandSchema,
  equipItemCommandSchema,
  giveItemCommandSchema,
  grantItemCommandSchema,
  takeItemCommandSchema,
  unequipItemCommandSchema,
  useItemCommandSchema,
  splitCoinsCommandSchema,
  MAX_SHARERS,
  setMerchantCommandSchema,
  buyItemCommandSchema,
  sellItemCommandSchema,
} from './commands.ts';
export { PARTY_STASH } from './views.ts';
export { COINAGES, coinageOf, coinsFor, splitWorth, type Coin, type CoinCount } from './coins.ts';
export {
  CRAFT_DAY_HOURS,
  MAX_CRAFT_HELPERS,
  MAX_CRAFT_PROJECTS,
  MAX_CRAFT_QUANTITY,
  MAX_DOWNTIME_DAYS,
  SCRIBING_TOOL,
  SPELL_SCROLL_COSTS,
  abandonCraftingCommandSchema,
  craftCost,
  scrollCatalogId,
  startCraftingCommandSchema,
  workDowntimeCommandSchema,
  type CraftingResponse,
  type CraftProjectView,
  type CraftRecipeView,
  type CraftScrollView,
} from './crafting.ts';
export type {
  InventoryItem,
  InventoryResponse,
  InventoryWeapon,
  MerchantOfferResponse,
} from './views.ts';
