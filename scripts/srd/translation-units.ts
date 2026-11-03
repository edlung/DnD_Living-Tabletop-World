import {
  abbreviationStrings,
  glossaryEntryStrings,
  rulesSectionStrings,
  type Strings,
} from '../../packages/rules/src/srd/russian.ts';
import {
  SRD_EQUIPMENT,
  SRD_MAGIC_ITEMS,
  SRD_MONSTERS,
  SRD_SPELLS,
} from '../../packages/rules/src/srd/catalog.ts';
import {
  SRD_ABBREVIATIONS,
  SRD_GLOSSARY,
  SRD_RULES_SECTIONS,
} from '../../packages/rules/src/srd/reference.ts';
import {
  equipmentStrings,
  magicItemStrings,
  monsterStrings,
  spellStrings,
} from '../../packages/rules/src/srd/russian-catalogs.ts';

/**
 * What the translation pass asks of each dataset (docs/adr/0055-rules-reference-and-toolbox.md §5):
 * its units — a key and the English strings, in the shape the Russian comes back in.
 */
export interface Unit {
  readonly key: string;
  readonly english: Strings;
}

export const DATASETS: Readonly<Record<string, () => Unit[]>> = {
  glossary: () =>
    SRD_GLOSSARY.map((entry) => ({ key: entry.entryId, english: glossaryEntryStrings(entry) })),
  'rules-sections': () =>
    SRD_RULES_SECTIONS.map((section) => ({
      key: section.sectionId,
      english: rulesSectionStrings(section),
    })),
  abbreviations: () => [{ key: 'all', english: abbreviationStrings(SRD_ABBREVIATIONS) }],
  'magic-items': () =>
    SRD_MAGIC_ITEMS.map((item) => ({ key: item.itemId, english: magicItemStrings(item) })),
  equipment: () =>
    SRD_EQUIPMENT.map((item) => ({ key: item.itemId, english: equipmentStrings(item) })),
  spells: () => SRD_SPELLS.map((spell) => ({ key: spell.spellId, english: spellStrings(spell) })),
  monsters: () =>
    SRD_MONSTERS.map((monster) => ({ key: monster.monsterId, english: monsterStrings(monster) })),
};
