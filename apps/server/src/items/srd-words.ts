import type { InventoryResponse, ItemEntry } from '@ltw/contracts';
import { itemEntry } from '@ltw/domain';
import {
  equipmentIn,
  magicItemIn,
  srdEquipment,
  srdMagicItem,
  type ReferenceLanguage,
} from '@ltw/rules';

/**
 * The SRD's words and table row for an SRD item catalog entry (`srd-…`; docs/adr/0054-items-as-
 * data.md §2, §4); null for Ravenford's own. The domain reads the entries; their words live in
 * `@ltw/rules`, which the server adds — in Russian for a Russian campaign once they exist
 * (docs/adr/0055-rules-reference-and-toolbox.md §5).
 */
export const srdWordsOf = (itemId: string, language: ReferenceLanguage = 'en') => {
  const words = itemId.startsWith('srd-') ? srdEquipment(itemId.slice(4)) : undefined;
  return words ? equipmentIn(words, language).value : null;
};

/** A magic entry's item of Magic Items A–Z; null for a mundane one. */
export const srdMagicOf = (itemId: string, language: ReferenceLanguage = 'en') => {
  const text = itemEntry(itemId)?.magic?.text;
  const magic = text === undefined ? undefined : srdMagicItem(text);
  return magic ? magicItemIn(magic, language).value : null;
};

/** What the SRD says of an entry: its equipment's words, else its magic item's. */
export const srdTextOf = (itemId: string, language: ReferenceLanguage = 'en'): string | null =>
  srdWordsOf(itemId, language)?.text || srdMagicOf(itemId, language)?.text || null;

/** "Weapon, +1, +2, or +3" in Russian, without its list: "Оружие". */
const PLUSES = /,\s*\+1[^]*$/;

/**
 * An SRD entry's Russian name once its Russian exists: its equipment's, or its magic item's — a
 * "+1" made of one of three ("Weapon, +1") by the Russian name before the list; null otherwise.
 */
function russianName(entry: ItemEntry): string | null {
  const words = entry.itemId.startsWith('srd-') ? srdEquipment(entry.itemId.slice(4)) : undefined;
  if (words) {
    const shown = equipmentIn(words, 'ru');
    return shown.language === 'ru' ? shown.value.name : null;
  }
  const text = entry.magic?.text;
  const magic = text === undefined ? undefined : srdMagicItem(text);
  if (!magic) return null;
  const shown = magicItemIn(magic, 'ru');
  if (shown.language !== 'ru') return null;
  if (entry.name.en === magic.name) return shown.value.name;
  const plus = /, (\+\d)$/.exec(entry.name.en);
  return plus && PLUSES.test(magic.name)
    ? `${shown.value.name.replace(PLUSES, '')}, ${plus[1] ?? ''}`
    : null;
}

const DAMAGE: Readonly<Record<string, string>> = {
  Bludgeoning: 'дробящий',
  Piercing: 'колющий',
  Slashing: 'рубящий',
};
const ABILITY: Readonly<Record<string, string>> = {
  Strength: 'Сила',
  Dexterity: 'Ловкость',
  Constitution: 'Телосложение',
  Intelligence: 'Интеллект',
  Wisdom: 'Мудрость',
  Charisma: 'Харизма',
};
const firstSentence = (text: string): string | null => {
  const first = /^(.+?[.!?])(?:\s|$)/.exec(text)?.[1];
  return first !== undefined && first.length <= 240 ? first : null;
};

/**
 * An SRD entry's line in Russian: a weapon's, an armor's, a Shield's or a tool's made from its
 * English one (`scripts/srd/item-catalog.ts` writes those), else the first sentence of its Russian
 * words; null where neither exists.
 */
function russianSummary(entry: ItemEntry): string | null {
  const english = entry.description.en;
  const weapon = /^(Simple|Martial) (melee|ranged) weapon: (\S+) (\w+)\.$/.exec(english);
  if (weapon) {
    const kind = weapon[1] === 'Simple' ? 'Простое' : 'Воинское';
    const reach = weapon[2] === 'melee' ? 'рукопашное' : 'дальнобойное';
    return `${kind} ${reach} оружие: ${weapon[3] ?? ''} ${DAMAGE[weapon[4] ?? ''] ?? ''} урон.`;
  }
  const armor =
    /^(Light|Medium|Heavy) armor: Armor Class (\d+)( \+ Dex modifier(?: \(max (\d+)\))?)?\.$/.exec(
      english,
    );
  if (armor) {
    const kind = { Light: 'Лёгкий', Medium: 'Средний', Heavy: 'Тяжёлый' }[armor[1] ?? 'Light'];
    const dex = armor[3]
      ? armor[4]
        ? ` + модификатор Ловкости (не более ${armor[4]})`
        : ' + модификатор Ловкости'
      : '';
    return `${kind ?? ''} доспех: КД ${armor[2] ?? ''}${dex}.`;
  }
  const shield = /^Shield: \+(\d+) to Armor Class\.$/.exec(english);
  if (shield) return `Щит: +${shield[1] ?? ''} к КД.`;
  const tool = /^Tool \((\w+)\):/.exec(english);
  if (tool) return `Инструмент (${ABILITY[tool[1] ?? ''] ?? tool[1] ?? ''}).`;
  const words = srdTextOf(entry.itemId, 'ru');
  return words ? firstSentence(words) : null;
}

/**
 * An entry as the campaign's language shows it: an SRD entry's Russian name and line, once its
 * Russian exists.
 */
export function entryIn(entry: ItemEntry, language: ReferenceLanguage): ItemEntry {
  if (language !== 'ru' || entry.source !== 'srd') return entry;
  const name = russianName(entry);
  if (name === null) return entry;
  const shown: ItemEntry = {
    ...entry,
    name: { ...entry.name, ru: name },
    description: { ...entry.description, ru: russianSummary(entry) ?? entry.description.ru },
  };
  // Its Russian exists: it is no longer marked untranslated.
  delete shown.untranslated;
  return shown;
}

/** An inventory with each SRD entry's words beside it (the domain cannot read them). */
export const withSrdWords = (
  body: InventoryResponse,
  language: ReferenceLanguage = 'en',
): InventoryResponse => ({
  ...body,
  items: body.items.map((item) => {
    const catalog = item.catalog;
    if (!catalog) return item;
    const words = srdTextOf(catalog.itemId, language);
    const entry = itemEntry(catalog.itemId);
    const shown = entry ? entryIn(entry, language) : null;
    const translated = shown !== null && shown !== entry;
    return {
      ...item,
      catalog: {
        ...catalog,
        ...(words ? { text: words } : {}),
        ...(translated
          ? { name: shown.name, description: shown.description, untranslated: false }
          : {}),
      },
    };
  }),
});
