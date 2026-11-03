import { describe, expect, it } from 'vitest';

import {
  SRD_ABBREVIATIONS,
  SRD_GLOSSARY,
  SRD_RULES_SECTIONS,
  srdGlossaryEntry,
} from './reference.ts';
import { SRD_EQUIPMENT, SRD_MAGIC_ITEMS, SRD_MONSTERS, SRD_SPELLS } from './catalog.ts';
import { equipmentIn, magicItemIn, monsterIn, spellIn } from './catalogs-ru.ts';
import { srdClass } from './classes.ts';
import { srdSpecies } from './origins.ts';
import charactersRu from './ru/characters.json' with { type: 'json' };
import { characterUnits, classIn, speciesIn } from './russian-characters.ts';
import { abbreviationsIn, glossaryEntryIn, rulesSectionIn } from './reference-ru.ts';
import abbreviationsRu from './ru/abbreviations.json' with { type: 'json' };
import gearRu from './ru/equipment.json' with { type: 'json' };
import glossaryRu from './ru/glossary.json' with { type: 'json' };
import itemsRu from './ru/magic-items.json' with { type: 'json' };
import monstersRu from './ru/monsters.json' with { type: 'json' };
import sectionsRu from './ru/rules-sections.json' with { type: 'json' };
import spellsRu from './ru/spells.json' with { type: 'json' };
import {
  equipmentStrings,
  magicItemStrings,
  monsterStrings,
  spellStrings,
} from './russian-catalogs.ts';
import {
  abbreviationStrings,
  glossaryEntryStrings,
  rulesSectionStrings,
  englishHash,
  translationProblem,
  type KeptRussian,
  type Strings,
} from './russian.ts';

/**
 * The SRD's words in Russian (docs/adr/0055-rules-reference-and-toolbox.md §5): every entry of the
 * rules reference and of the catalogs has a Russian made from the English it has now, holding its
 * shape, numbers and dice; a Russian whose English has changed gives way to the English.
 */
function allInRussian<T>(
  entries: readonly T[],
  idOf: (entry: T) => string,
  inLanguage: (entry: T, language: 'ru') => { readonly language: 'en' | 'ru' },
  strings: (entry: T) => Strings,
  kept: Readonly<Record<string, KeptRussian | undefined>>,
): void {
  for (const entry of entries) {
    const id = idOf(entry);
    expect(inLanguage(entry, 'ru').language, id).toBe('ru');
    expect(translationProblem(strings(entry), kept[id]?.ru), id).toBeNull();
  }
}

describe('the Russian rules reference', () => {
  it('has every entry, section and abbreviation in Russian, current and whole', () => {
    for (const entry of SRD_GLOSSARY) {
      expect(glossaryEntryIn(entry, 'ru').language, entry.entryId).toBe('ru');
      expect(
        translationProblem(glossaryEntryStrings(entry), glossaryRu[entry.entryId]?.ru),
      ).toBeNull();
    }
    for (const section of SRD_RULES_SECTIONS) {
      expect(rulesSectionIn(section, 'ru').language, section.sectionId).toBe('ru');
      expect(
        translationProblem(rulesSectionStrings(section), sectionsRu[section.sectionId]?.ru),
      ).toBeNull();
    }
    expect(abbreviationsIn('ru').language).toBe('ru');
    expect(
      translationProblem(abbreviationStrings(SRD_ABBREVIATIONS), abbreviationsRu['all']?.ru),
    ).toBeNull();
  });

  it('has every spell, stat block, magic item and piece of equipment in Russian, current', () => {
    allInRussian(SRD_SPELLS, (one) => one.spellId, spellIn, spellStrings, spellsRu);
    allInRussian(SRD_MONSTERS, (one) => one.monsterId, monsterIn, monsterStrings, monstersRu);
    allInRussian(SRD_MAGIC_ITEMS, (one) => one.itemId, magicItemIn, magicItemStrings, itemsRu);
    allInRussian(SRD_EQUIPMENT, (one) => one.itemId, equipmentIn, equipmentStrings, gearRu);
  });

  it('has every class part, species, background and feat in Russian, current', () => {
    const kept = charactersRu as Readonly<Record<string, KeptRussian | undefined>>;
    for (const unit of characterUnits()) {
      expect(kept[unit.key]?.hash, unit.key).toBe(englishHash(unit.english));
      expect(translationProblem(unit.english, kept[unit.key]?.ru), unit.key).toBeNull();
    }
    const wizard = srdClass('wizard');
    const elf = srdSpecies('elf');
    if (!wizard || !elf) throw new Error('no Wizard or Elf');
    expect(classIn(wizard, 'ru').value.name).toBe('Волшебник');
    expect(speciesIn(elf, 'ru').value.name).toBe('Эльф');
    expect(classIn(wizard, 'en').value).toBe(wizard);
  });

  it('reads Prone in the app’s own words, and English where its Russian is stale', () => {
    const prone = srdGlossaryEntry('prone');
    if (!prone) throw new Error('no Prone');
    expect(glossaryEntryIn(prone, 'ru').value.name).toBe('Сбит с ног');
    expect(glossaryEntryIn(prone, 'en')).toEqual({ value: prone, language: 'en' });
    const changed = {
      ...prone,
      blocks: [...prone.blocks, { kind: 'names' as const, names: ['Crawling'] }],
    };
    expect(glossaryEntryIn(changed, 'ru')).toEqual({ value: changed, language: 'en' });
  });

  it('keeps a Russian only when its numbers and dice are the English’s', () => {
    expect(translationProblem('Roll two d20s; DC 15.', 'Бросьте два d20; Сл 15.')).toBeNull();
    expect(
      translationProblem('It takes 11 (2d10) damage.', 'Он получает 11 (2d10) урона.'),
    ).toBeNull();
    expect(
      translationProblem('It takes 11 (2d10) damage.', 'Он получает 12 (2d10) урона.'),
    ).toMatch(/numbers/);
    expect(
      translationProblem('It takes 11 (2d10) damage.', 'Он получает 11 (2к10) урона.'),
    ).toMatch(/dice/);
    expect(translationProblem({ a: ['x', 'y'] }, { a: ['х'] })).toMatch(/length/);
    expect(translationProblem('1,500 GP', '1 500 зм')).toBeNull();
  });
});
