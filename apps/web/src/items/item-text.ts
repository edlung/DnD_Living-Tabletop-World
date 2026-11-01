import type { EquipSlot, InventoryItem, ItemCategory, ItemEffect } from '@ltw/contracts';
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

/** What the item is, in the campaign's language; the world's own name stays the title. */
export const kindName = (item: InventoryItem, language: Language) =>
  item.catalog ? item.catalog.name[language === 'ru' ? 'ru' : 'en'] : null;

export const kindDescription = (item: InventoryItem, language: Language) =>
  item.catalog ? item.catalog.description[language === 'ru' ? 'ru' : 'en'] : null;

export function effectText(t: Translate, effect: ItemEffect): string {
  switch (effect.kind) {
    case 'heal':
      return t('Restores {amount} hit points', { amount: effect.amount });
    case 'removeCondition':
      return t('Ends the {condition} condition', { condition: t(effect.condition) });
    case 'narrative':
      return t('Has no game effect; the DM narrates it');
  }
}

export const formatWeight = (pounds: number) =>
  `${Number.isInteger(pounds) ? pounds : pounds.toFixed(1)}`;
