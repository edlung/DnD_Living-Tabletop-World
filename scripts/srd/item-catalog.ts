import type {
  AmmunitionKind,
  EquipSlot,
  ItemEntry,
  WeaponId,
} from '../../packages/contracts/src/index.ts';

import type { SrdEquipmentText } from './equipment.ts';

/**
 * The catalog entries the World Engine applies, from the SRD's equipment text
 * (docs/adr/0054-items-as-data.md §2): category, slots, stack, weight, worth, and the armor, shield,
 * weapon or ammunition an entry is. Ids are `srd-` and the text's slug. The Russian words are the
 * English ones, marked untranslated, until the translation pipeline (Stage 650e) supplies them.
 */
export const SRD_ID_PREFIX = 'srd-';

/** What a use spends: one of the stack, and the DM says what it did. */
const CONSUMABLE = new Set([
  'acid',
  'alchemists-fire',
  'antitoxin',
  'holy-water',
  'oil',
  'poison-basic',
  'potion-of-healing',
  'rations',
  'spell-scroll-cantrip',
  'spell-scroll-level-1',
]);
/** Gear bought and carried by the piece. */
const STACKED = new Set(['candle', 'torch', 'paper', 'parchment', 'ink']);
const AMMUNITION: Readonly<Record<string, AmmunitionKind>> = {
  arrow: 'arrow',
  bolt: 'bolt',
  'firearm-bullet': 'firearm-bullet',
  'sling-bullet': 'bullet',
  needle: 'needle',
};
const LIGHT = /^Light$/;

export function catalogEntryOf(item: SrdEquipmentText): ItemEntry {
  const base = {
    itemId: `${SRD_ID_PREFIX}${item.itemId}`,
    name: { en: item.name, ru: item.name },
    description: { en: summary(item), ru: summary(item) },
    weightLb: round(item.weightLb ?? 0, 10_000),
    valueCp: round(item.costCp ?? 0, 100),
    source: 'srd' as const,
    untranslated: true as const,
  };
  const plain = (category: ItemEntry['category'], slots: EquipSlot[] = []): ItemEntry => ({
    ...base,
    category,
    stackable: false,
    slots,
  });
  switch (item.kind) {
    case 'coin':
      return { ...plain('coins'), stackable: true };
    case 'weapon': {
      const light = item.weapon?.properties.some((property) => LIGHT.test(property)) === true;
      return {
        ...plain('weapon', light ? ['mainhand', 'offhand'] : ['mainhand']),
        weapon: item.itemId as WeaponId,
      };
    }
    case 'armor': {
      const armor = item.armor;
      if (!armor) throw new Error(`armor ${item.itemId} has no row`);
      return {
        ...plain('armor', ['body']),
        armor: {
          baseAc: armor.armorClass,
          dexCap: armor.dexCap,
          ...(armor.strength === null ? {} : { strength: armor.strength }),
          ...(armor.stealthDisadvantage ? { stealthDisadvantage: true as const } : {}),
        },
      };
    }
    case 'shield':
      return { ...plain('shield', ['offhand']), shieldBonus: item.armor?.armorClass ?? 2 };
    case 'tool':
      return plain('tool');
    case 'ammunition': {
      const amount = item.bundle?.amount ?? 1;
      const kind = AMMUNITION[item.itemId];
      if (kind === undefined) throw new Error(`ammunition ${item.itemId} has no kind`);
      return {
        ...plain('gear'),
        weightLb: round((item.weightLb ?? 0) / amount, 10_000),
        valueCp: round((item.costCp ?? 0) / amount, 100),
        stackable: true,
        ammunition: kind,
      };
    }
    case 'food':
      return { ...plain('consumable'), stackable: true, effect: { kind: 'narrative' } };
    case 'focus':
      return plain('gear', /^amulet-/.test(item.itemId) ? ['neck'] : []);
    case 'pack':
    case 'tack':
      return plain('gear');
    case 'gear':
      if (CONSUMABLE.has(item.itemId))
        return { ...plain('consumable'), stackable: true, effect: { kind: 'narrative' } };
      return { ...plain('gear'), stackable: STACKED.has(item.itemId) };
  }
}

const round = (value: number, per: number) => Math.round(value * per) / per;

/** A line about it of at most 240 characters: its first sentence, or what kind of thing it is. */
function summary(item: SrdEquipmentText): string {
  if (item.weapon) {
    const { category, melee, damage, damageType } = item.weapon;
    return `${capital(category)} ${melee ? 'melee' : 'ranged'} weapon: ${damage} ${capital(damageType)}.`;
  }
  if (item.armor) {
    const { category, armorClass, dexCap } = item.armor;
    if (category === 'shield') return `Shield: +${String(armorClass)} to Armor Class.`;
    const dex =
      dexCap === null
        ? ' + Dex modifier'
        : dexCap > 0
          ? ` + Dex modifier (max ${String(dexCap)})`
          : '';
    return `${capital(category)} armor: Armor Class ${String(armorClass)}${dex}.`;
  }
  if (item.tool) return `Tool (${item.tool.ability}): ${item.tool.utilize}.`.slice(0, 240);
  const first = /^(.+?[.!?])(?:\s|$)/.exec(item.text)?.[1];
  if (first !== undefined && first.length <= 240) return first;
  return KIND_WORDS[item.kind];
}

const KIND_WORDS: Readonly<Record<SrdEquipmentText['kind'], string>> = {
  coin: 'A coin.',
  weapon: 'A weapon.',
  armor: 'Armor.',
  shield: 'A Shield.',
  tool: 'A tool.',
  gear: 'Adventuring gear.',
  ammunition: 'Ammunition.',
  focus: 'A spellcasting focus.',
  pack: 'An equipment pack.',
  tack: 'Tack, harness or a drawn vehicle.',
  food: 'Food or drink.',
};

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
