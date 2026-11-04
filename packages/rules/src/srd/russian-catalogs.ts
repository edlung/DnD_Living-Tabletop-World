import type { SrdEquipment, SrdMagicItem, SrdMonster, SrdSpell } from '@ltw/contracts';

import type { Strings } from './russian.ts';

/**
 * The SRD's catalogs in Russian (docs/adr/0055-rules-reference-and-toolbox.md §5): each catalog
 * entry's words as a unit of strings for the translation pass, and the entry with its Russian put
 * back. Numbers that are data (AC, hit points, levels) never enter a unit.
 */
const text = (value: Strings | undefined): string => (typeof value === 'string' ? value : '');
const list = (value: Strings | undefined): readonly Strings[] =>
  Array.isArray(value) ? (value as readonly Strings[]) : [];
const field = (value: Strings | undefined, key: string): Strings | undefined =>
  value !== undefined && typeof value === 'object' && !Array.isArray(value)
    ? (value as { readonly [key: string]: Strings })[key]
    : undefined;

export const magicItemStrings = (item: SrdMagicItem): Strings => ({
  name: item.name,
  text: item.text,
});
export const russianMagicItem = (item: SrdMagicItem, ru: Strings): SrdMagicItem => ({
  ...item,
  name: text(field(ru, 'name')),
  text: text(field(ru, 'text')),
});

export const equipmentStrings = (item: SrdEquipment): Strings => ({
  name: item.name,
  text: item.text,
});
export const russianEquipment = (item: SrdEquipment, ru: Strings): SrdEquipment => ({
  ...item,
  name: text(field(ru, 'name')),
  text: text(field(ru, 'text')),
});

export const spellStrings = (spell: SrdSpell): Strings => ({
  name: spell.name,
  castingTime: spell.castingTime,
  range: spell.range,
  material: spell.components.material ?? '',
  duration: spell.duration,
  description: spell.description,
  higherLevels: spell.higherLevels ?? '',
});
export const russianSpell = (spell: SrdSpell, ru: Strings): SrdSpell => ({
  ...spell,
  name: text(field(ru, 'name')),
  castingTime: text(field(ru, 'castingTime')),
  range: text(field(ru, 'range')),
  components: {
    ...spell.components,
    material: spell.components.material === null ? null : text(field(ru, 'material')),
  },
  duration: text(field(ru, 'duration')),
  description: text(field(ru, 'description')),
  higherLevels: spell.higherLevels === null ? null : text(field(ru, 'higherLevels')),
});

type Named = SrdMonster['traits'][number];
const namedStrings = (entries: readonly Named[]): Strings =>
  entries.map((entry) => [entry.name, entry.text]);
const russianNamed = (entries: readonly Named[], ru: Strings | undefined): Named[] =>
  entries.map((entry, index) => {
    const [name, words] = list(list(ru)[index]);
    return { ...entry, name: text(name), text: text(words) };
  });

/** A stat block's words: its name and lines, and every trait and action by name. */
export const monsterStrings = (monster: SrdMonster): Strings => ({
  name: monster.name,
  type: monster.type,
  alignment: monster.alignment,
  speed: monster.speed,
  senses: monster.senses,
  languages: monster.languages,
  traits: namedStrings(monster.traits),
  actions: namedStrings(monster.actions),
  bonusActions: namedStrings(monster.bonusActions),
  reactions: namedStrings(monster.reactions),
  legendary: monster.legendary
    ? { uses: monster.legendary.uses, entries: namedStrings(monster.legendary.entries) }
    : '',
});
export const russianMonster = (monster: SrdMonster, ru: Strings): SrdMonster => ({
  ...monster,
  name: text(field(ru, 'name')),
  type: text(field(ru, 'type')),
  alignment: text(field(ru, 'alignment')),
  speed: text(field(ru, 'speed')),
  senses: text(field(ru, 'senses')),
  languages: text(field(ru, 'languages')),
  traits: russianNamed(monster.traits, field(ru, 'traits')),
  actions: russianNamed(monster.actions, field(ru, 'actions')),
  bonusActions: russianNamed(monster.bonusActions, field(ru, 'bonusActions')),
  reactions: russianNamed(monster.reactions, field(ru, 'reactions')),
  legendary: monster.legendary
    ? {
        ...monster.legendary,
        uses: text(field(field(ru, 'legendary'), 'uses')),
        entries: russianNamed(monster.legendary.entries, field(field(ru, 'legendary'), 'entries')),
      }
    : null,
});
