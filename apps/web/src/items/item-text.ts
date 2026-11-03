import type {
  EquipSlot,
  InventoryItem,
  ItemCategory,
  ItemEffect,
  ItemRarity,
} from '@ltw/contracts';
import type { Language, Translate } from '@ltw/ui';

/** The words of items. Sentences are English keys the dictionary translates (ADR 0031 §10). */
const SLOTS: Readonly<Record<EquipSlot, string>> = {
  mainhand: 'Main hand',
  offhand: 'Off hand',
  body: 'Body',
  head: 'Head',
  hands: 'Hands',
  feet: 'Feet',
  cloak: 'Cloak',
  neck: 'Neck',
  ring: 'Ring',
};
const CATEGORIES: Readonly<Record<ItemCategory, string>> = {
  armor: 'Armor',
  shield: 'Shield',
  weapon: 'Weapon',
  consumable: 'Consumable',
  gear: 'Gear',
  tool: 'Tool',
  coins: 'Coins',
};

export const slotName = (t: Translate, slot: EquipSlot) => t(SLOTS[slot]);
export const categoryName = (t: Translate, category: ItemCategory) => t(CATEGORIES[category]);

/** A magic item's rarity (docs/adr/0054-items-as-data.md §5). */
const RARITIES: Readonly<Record<ItemRarity, string>> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very rare',
  legendary: 'Legendary',
  artifact: 'Artifact',
  varies: 'Rarity varies',
};
export const rarityName = (t: Translate, rarity: ItemRarity) => t(RARITIES[rarity]);

/** What the item is, in the campaign's language; the world's own name stays the title. */
export const kindName = (item: InventoryItem, language: Language) =>
  item.catalog ? item.catalog.name[language === 'ru' ? 'ru' : 'en'] : null;

export const kindDescription = (item: InventoryItem, language: Language) =>
  item.catalog ? item.catalog.description[language === 'ru' ? 'ru' : 'en'] : null;

export function effectText(t: Translate, effect: ItemEffect): string {
  switch (effect.kind) {
    case 'heal':
      return t('Restores {amount} hit points', { amount: effect.amount });
    case 'heal-dice':
      return t('Restores {dice} hit points', {
        dice: `${String(effect.count)}d${String(effect.sides)}${effect.bonus > 0 ? ` + ${String(effect.bonus)}` : ''}`,
      });
    case 'removeCondition':
      return t('Ends the {condition} condition', { condition: t(effect.condition) });
    case 'narrative':
      return t('Has no game effect; the DM narrates it');
  }
}

/**
 * Pounds to the tenth; below a pound, to the hundredth (a coin weighs 0.02 lb). A number, so the
 * dictionary writes its fraction as the language does ("0,5" in Russian).
 */
export const roundWeight = (pounds: number) => {
  const step = pounds < 1 ? 100 : 10;
  return Math.round(pounds * step) / step;
};
