import type { ItemEntry } from './schema.ts';

/** Armor and shields of the Ravenford setting (original content). */
export const ARMOR_ITEMS: readonly ItemEntry[] = [
  {
    itemId: 'quilted-gambeson',
    category: 'armor',
    name: { ru: 'Стёганка гильдии', en: 'Guild gambeson' },
    description: {
      ru: 'Плотная стёганая куртка, какую носят охранники гильдейских обозов.',
      en: 'A thick quilted jacket worn by the guild caravan guards.',
    },
    weightLb: 8,
    valueCp: 1000,
    stackable: false,
    slots: ['body'],
    armor: { baseAc: 11, dexCap: null, stealthDisadvantage: true },
  },
  {
    itemId: 'traveller-jerkin',
    category: 'armor',
    name: { ru: 'Дорожная куртка', en: 'Traveller jerkin' },
    description: {
      ru: 'Выделанная кожа с нашитыми костяными пластинами.',
      en: 'Cured leather with sewn-on bone plates.',
    },
    weightLb: 10,
    valueCp: 4500,
    stackable: false,
    slots: ['body'],
    armor: { baseAc: 12, dexCap: null },
  },
  {
    itemId: 'ravenford-brigandine',
    category: 'armor',
    name: { ru: 'Равенфордский бригандин', en: 'Ravenford brigandine' },
    description: {
      ru: 'Кожаный жилет с клёпаными стальными пластинами под тканью.',
      en: 'A leather vest with riveted steel plates beneath the cloth.',
    },
    weightLb: 20,
    valueCp: 12000,
    stackable: false,
    slots: ['body'],
    armor: { baseAc: 13, dexCap: 2 },
  },
  {
    itemId: 'watchman-mail',
    category: 'armor',
    name: { ru: 'Кольчуга городской стражи', en: 'Watchman mail' },
    description: {
      ru: 'Тяжёлая кольчуга с гербом северных ворот на плече.',
      en: 'Heavy mail with the north gate crest on the shoulder.',
    },
    weightLb: 40,
    valueCp: 60000,
    stackable: false,
    slots: ['body'],
    armor: { baseAc: 16, dexCap: 0, strength: 13, stealthDisadvantage: true },
  },
  {
    itemId: 'oak-buckler',
    category: 'shield',
    name: { ru: 'Дубовый баклер', en: 'Oak buckler' },
    description: {
      ru: 'Небольшой круглый щит, окованный по краю железом.',
      en: 'A small round shield rimmed with iron.',
    },
    weightLb: 3,
    valueCp: 1500,
    stackable: false,
    slots: ['offhand'],
    shieldBonus: 1,
  },
  {
    itemId: 'stag-shield',
    category: 'shield',
    name: { ru: 'Щит с оленем', en: 'Stag shield' },
    description: {
      ru: 'Крепкий щит с гербом трактира «Золотой олень».',
      en: 'A sturdy shield bearing the Golden Stag inn crest.',
    },
    weightLb: 6,
    valueCp: 10000,
    stackable: false,
    slots: ['offhand'],
    shieldBonus: 2,
  },
];
