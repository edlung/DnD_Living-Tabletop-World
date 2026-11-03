import type {
  EquipSlot,
  ItemEntry,
  ItemLook,
  ItemMagic,
  ItemRarity,
  SrdEquipment,
  SrdMagicItem,
} from '../../packages/contracts/src/index.ts';
import { SRD_ID_PREFIX } from './item-catalog.ts';
import { slugOf } from './text.ts';

/**
 * The magic items' catalog entries, from their text (docs/adr/0054-items-as-data.md §2, §5): rarity
 * and its worth, attunement, what a weapon, armor or shield may be made on, and what the text says
 * regularly — a +1 to attack and damage, a bonus to Armor Class or saves, charges and their dawn,
 * a curse. "+1, +2, or +3" items are three entries; the healing potions, one per strength. What
 * the text says otherwise stays the DM's: the card shows the words.
 */
const RARITY: Readonly<Record<string, ItemRarity>> = {
  Common: 'common',
  Uncommon: 'uncommon',
  Rare: 'rare',
  'Very Rare': 'very-rare',
  Legendary: 'legendary',
  Artifact: 'artifact',
};
/** Magic Item Rarities and Values (SRD 5.2.1), in copper pieces; an Artifact is priceless. */
const VALUE_CP: Readonly<Record<ItemRarity, number>> = {
  common: 10_000,
  uncommon: 40_000,
  rare: 400_000,
  'very-rare': 4_000_000,
  legendary: 20_000_000,
  artifact: 0,
  varies: 0,
};
/** Worn where: a wondrous item by what it is. */
const WORN: readonly (readonly [RegExp, EquipSlot])[] = [
  [/\b(Amulet|Necklace|Periapt|Medallion|Brooch|Scarab|Talisman)\b/, 'neck'],
  [/\b(Cloak|Cape|Mantle)\b/, 'cloak'],
  [/\b(Boots|Slippers)\b/, 'feet'],
  [/\b(Gloves|Gauntlets|Bracers)\b/, 'hands'],
  [/\b(Helm|Hat|Circlet|Headband)\b/, 'head'],
];

export function magicCatalogEntries(
  item: SrdMagicItem,
  equipment: readonly SrdEquipment[],
): ItemEntry[] {
  const plus = /^(.+), \+1, \+2, or \+3$/.exec(item.name);
  if (plus) {
    const rarities = [
      ...item.rarity.matchAll(/(Common|Uncommon|Rare|Very Rare|Legendary) \(\+(\d)\)/g),
    ];
    return rarities.map(([, rarity = '', bonus = '1']) =>
      entryOf(item, equipment, {
        itemId: `${slugOf(plus[1] ?? '')}-plus-${bonus}`,
        name: `${plus[1] ?? ''}, +${bonus}`,
        rarity: RARITY[rarity] ?? 'varies',
        plus: Number(bonus),
      }),
    );
  }
  if (item.itemId === 'potions-of-healing') return healingPotions(item);
  const single = RARITY[item.rarity];
  return [
    entryOf(item, equipment, {
      itemId: item.itemId,
      name: item.name,
      rarity: single ?? 'varies',
      plus: null,
    }),
  ];
}

function entryOf(
  item: SrdMagicItem,
  equipment: readonly SrdEquipment[],
  as: { itemId: string; name: string; rarity: ItemRarity; plus: number | null },
): ItemEntry {
  const base = baseOf(item, equipment);
  const consumable = item.category === 'Potion' || item.category === 'Scroll';
  const ammunition = base?.kind === 'ammunition';
  const bonus = bonusOf(item, as.plus, base?.kind ?? null);
  const charges = chargesOf(item.text);
  const magic: ItemMagic = {
    rarity: as.rarity,
    attunement: item.attunement,
    ...(Object.keys(bonus).length > 0 ? { bonus } : {}),
    ...(charges ? { charges } : {}),
    ...(/(^|\n)Curse\./.test(item.text) ? { cursed: true as const } : {}),
    ...(base ? { base } : {}),
    text: item.itemId,
  };
  // A consumable is worth half; a piece of ammunition, a tenth of a potion of its rarity.
  const worth = VALUE_CP[as.rarity] / (ammunition ? 20 : consumable ? 2 : 1);
  const words = firstSentence(item.text);
  return {
    itemId: `${SRD_ID_PREFIX}${as.itemId}`,
    category: base ? CATEGORY_OF_BASE[base.kind] : consumable ? 'consumable' : 'gear',
    name: { en: as.name, ru: as.name },
    description: { en: words, ru: words },
    weightLb: item.category === 'Potion' ? 0.5 : 0,
    valueCp: worth,
    stackable: consumable || ammunition,
    slots: base || consumable ? [] : slotsOf(item),
    ...(consumable ? { effect: { kind: 'narrative' as const } } : {}),
    source: 'srd',
    untranslated: true,
    look: base ? LOOK_OF_BASE[base.kind] : LOOK_OF_CATEGORY[item.category],
    magic,
  };
}

/** What a magic item looks like, for its kind's picture (docs/adr/0055-…md §6). */
const LOOK_OF_BASE = {
  weapon: 'melee-weapon',
  armor: 'armor',
  shield: 'shield',
  ammunition: 'ammunition',
} as const satisfies Record<string, ItemLook>;
const LOOK_OF_CATEGORY: Readonly<Record<SrdMagicItem['category'], ItemLook>> = {
  Armor: 'armor',
  Potion: 'potion',
  Ring: 'ring',
  Rod: 'rod',
  Scroll: 'scroll',
  Staff: 'staff',
  Wand: 'wand',
  Weapon: 'melee-weapon',
  'Wondrous Item': 'wondrous',
};

const CATEGORY_OF_BASE = {
  weapon: 'weapon',
  armor: 'armor',
  shield: 'shield',
  ammunition: 'gear',
} as const;

function slotsOf(item: SrdMagicItem): EquipSlot[] {
  if (item.category === 'Ring') return ['ring'];
  if (item.category !== 'Wondrous Item') return [];
  const worn = WORN.find(([pattern]) => pattern.test(item.name));
  return worn ? [worn[1]] : [];
}

/** What a magic weapon, armor, shield or ammunition may be made on: catalog ids. */
function baseOf(item: SrdMagicItem, equipment: readonly SrdEquipment[]): ItemMagic['base'] {
  const of = item.of;
  if (of === null || (item.category !== 'Armor' && item.category !== 'Weapon')) return undefined;
  const id = (entry: SrdEquipment) => `${SRD_ID_PREFIX}${entry.itemId}`;
  if (of === 'Any Ammunition')
    return {
      kind: 'ammunition',
      allowed: equipment.filter((e) => e.kind === 'ammunition').map(id),
    };
  if (of === 'Shield') return { kind: 'shield', allowed: [`${SRD_ID_PREFIX}shield`] };
  if (item.category === 'Armor') {
    const armor = equipment.filter((e) => e.kind === 'armor');
    const any = /^Any (.+?)(?:, Except (.+))?$/.exec(of);
    const allowed = any
      ? armor.filter(
          (e) =>
            new RegExp(`\\b${capital(e.armor?.category ?? '')}\\b`).test(any[1] ?? '') &&
            e.name !== any[2],
        )
      : armor.filter((e) => namesIn(of).includes(e.name));
    if (allowed.length === 0) throw new Error(`"${item.name}" made on nothing: ${of}`);
    return { kind: 'armor', allowed: allowed.map(id) };
  }
  const weapons = equipment.filter((e) => e.kind === 'weapon');
  const allowed =
    of === 'Any Simple or Martial'
      ? weapons
      : of === 'Any Melee Weapon'
        ? weapons.filter((e) => e.weapon?.melee === true)
        : weapons.filter((e) => namesIn(of).includes(e.name));
  if (allowed.length === 0) throw new Error(`"${item.name}" made on nothing: ${of}`);
  return { kind: 'weapon', allowed: allowed.map(id) };
}

/** "Glaive, Greatsword, or Longsword" → its names. */
const namesIn = (of: string) =>
  of
    .split(/, (?:or )?| or /)
    .map((name) => name.trim())
    .filter((name) => name !== '');

/**
 * The bonuses the text gives regularly: "+N" of a "+1, +2, or +3" item; "a +1 bonus to attack
 * rolls and damage rolls made with this magic weapon"; an armor's or a shield's "+2 bonus to Armor
 * Class" (not one against some attacks only); a worn item's "+1 bonus to Armor Class and saving
 * throws while you wear" it, or to saving throws alone.
 */
function bonusOf(
  item: SrdMagicItem,
  plus: number | null,
  base: NonNullable<ItemMagic['base']>['kind'] | null,
): NonNullable<ItemMagic['bonus']> {
  if (plus !== null) {
    if (base === 'weapon' || base === 'ammunition') return { attack: plus, damage: plus };
    if (base === 'armor' || base === 'shield') return { armorClass: plus };
    return {};
  }
  const weapon =
    /\+(\d) bonus to attack rolls and damage rolls made with this (?:magic )?weapon/.exec(
      item.text,
    );
  if (base === 'weapon' && weapon) return { attack: Number(weapon[1]), damage: Number(weapon[1]) };
  const armor =
    /\+(\d) bonus to Armor Class(?=[.,]| while you wear)(?![^.]*\b(against|if you)\b)/.exec(
      item.text,
    );
  if ((base === 'armor' || base === 'shield') && armor) return { armorClass: Number(armor[1]) };
  const worn = /\+(\d) bonus to Armor Class and saving throws while (?:you wear|wearing)/.exec(
    item.text,
  );
  if (worn) return { armorClass: Number(worn[1]), saves: Number(worn[1]) };
  const saves = /\+(\d) bonus to saving throws while you wear/.exec(item.text);
  if (saves) return { saves: Number(saves[1]) };
  return {};
}

/** "This wand has 7 charges … regains 1d6 + 1 expended charges daily at dawn." */
function chargesOf(text: string): ItemMagic['charges'] {
  const max = /\bhas (\d+) charges\b/.exec(text);
  if (!max) return undefined;
  const dice = /regains (\d+)d(\d+)(?: \+ (\d+))? expended charges daily at dawn/.exec(text);
  const flat = /regains (\d+) expended charges? daily at dawn/.exec(text);
  const all = /regains all expended charges daily at dawn/.test(text);
  const regain = dice
    ? { count: Number(dice[1]), sides: Number(dice[2]), bonus: Number(dice[3] ?? 0) }
    : flat
      ? { count: 0, sides: 1, bonus: Number(flat[1]) }
      : all
        ? { count: 0, sides: 1, bonus: Number(max[1]) }
        : null;
  return { max: Number(max[1]), regain };
}

/** The four healing potions of the Potions of Healing table; the Common one is the gear's. */
function healingPotions(item: SrdMagicItem): ItemEntry[] {
  const rows = [
    ...item.text.matchAll(
      /^Potion of Healing (\d+)d(\d+) \+ (\d+) (Uncommon|Rare|Very Rare) \((\w+)\)$/gm,
    ),
  ];
  if (rows.length !== 3) throw new Error(`Potions of Healing: ${String(rows.length)} rows`);
  return rows.map(([, count = '', sides = '', bonus = '', rarity = '', strength = '']) => {
    const name = `Potion of Healing (${capital(strength)})`;
    const level = RARITY[rarity] ?? 'varies';
    return {
      itemId: `${SRD_ID_PREFIX}potion-of-healing-${strength}`,
      category: 'consumable',
      look: 'potion',
      name: { en: name, ru: name },
      description: { en: firstSentence(item.text), ru: firstSentence(item.text) },
      weightLb: 0.5,
      valueCp: VALUE_CP[level] / 2,
      stackable: true,
      slots: [],
      effect: {
        kind: 'heal-dice',
        count: Number(count),
        sides: Number(sides) as 4,
        bonus: Number(bonus),
      },
      source: 'srd',
      untranslated: true,
      magic: { rarity: level, attunement: null, text: item.itemId },
    };
  });
}

const firstSentence = (text: string) => {
  const first = /^(.+?[.!?])(?:\s|$)/.exec(text)?.[1] ?? text;
  return first.length <= 240 ? first : `${first.slice(0, 237)}…`;
};

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
