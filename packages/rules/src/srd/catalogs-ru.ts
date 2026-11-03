import type { SrdEquipment, SrdMagicItem, SrdMonster, SrdSpell } from '@ltw/contracts';

import type { InLanguage, ReferenceLanguage } from './reference-ru.ts';
import equipmentRu from './ru/equipment.json' with { type: 'json' };
import magicItemsRu from './ru/magic-items.json' with { type: 'json' };
import monstersRu from './ru/monsters.json' with { type: 'json' };
import spellsRu from './ru/spells.json' with { type: 'json' };
import {
  equipmentStrings,
  magicItemStrings,
  monsterStrings,
  russianEquipment,
  russianMagicItem,
  russianMonster,
  russianSpell,
  spellStrings,
} from './russian-catalogs.ts';
import { englishHash, type KeptRussian, type Strings } from './russian.ts';

/**
 * The SRD's catalogs in a campaign's language (docs/adr/0055-rules-reference-and-toolbox.md §5):
 * a spell, a stat block, a magic item or a piece of equipment in Russian while its Russian is
 * current, else in English, marked so.
 */
function inLanguage<T>(
  entry: T,
  language: ReferenceLanguage,
  kept: KeptRussian | undefined,
  strings: (entry: T) => Strings,
  russian: (entry: T, ru: Strings) => T,
): InLanguage<T> {
  if (language !== 'ru' || kept === undefined || kept.hash !== englishHash(strings(entry)))
    return { value: entry, language: 'en' };
  return { value: russian(entry, kept.ru), language: 'ru' };
}

export const spellIn = (spell: SrdSpell, language: ReferenceLanguage): InLanguage<SrdSpell> =>
  inLanguage(spell, language, spellsRu[spell.spellId], spellStrings, russianSpell);

export const monsterIn = (
  monster: SrdMonster,
  language: ReferenceLanguage,
): InLanguage<SrdMonster> =>
  inLanguage(monster, language, monstersRu[monster.monsterId], monsterStrings, russianMonster);

export const magicItemIn = (
  item: SrdMagicItem,
  language: ReferenceLanguage,
): InLanguage<SrdMagicItem> =>
  inLanguage(item, language, magicItemsRu[item.itemId], magicItemStrings, russianMagicItem);

export const equipmentIn = (
  item: SrdEquipment,
  language: ReferenceLanguage,
): InLanguage<SrdEquipment> =>
  inLanguage(item, language, equipmentRu[item.itemId], equipmentStrings, russianEquipment);
