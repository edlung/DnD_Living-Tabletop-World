import type { TableSpec } from './reference-tables.ts';

/**
 * The tables of the SRD's character chapters (docs/adr/0056-characters-from-the-srd.md §1): a
 * subclass's spells by level, Wild Shape's forms, Font of Magic's slots, and a species' choices.
 * A lineage's level 3 and level 5 spells stand in one piece, so their names are written here.
 */
const levelSpells = (title: string, level: string): TableSpec => ({
  title,
  header: `${level} Spells`,
  columns: [level, 'Spells'],
  row: /^(\d+) (.+)$/,
});

export const CHARACTER_TABLE_SPECS: readonly TableSpec[] = [
  { ...levelSpells('Life Domain Spells', 'Cleric Level'), header: 'Cleric Prepared Spells Level' },
  ...['Arid Land', 'Polar Land', 'Temperate Land', 'Tropical Land'].map((title) => ({
    ...levelSpells(title, 'Druid Level'),
    header: 'Druid Level Circle Spells',
    columns: ['Druid Level', 'Circle Spells'],
  })),
  levelSpells('Oath of Devotion Spells', 'Paladin Level'),
  { ...levelSpells('Draconic Spells', 'Sorcerer Level'), header: 'Sorcerer Level Spells' },
  levelSpells('Fiend Spells', 'Warlock Level'),
  {
    title: 'Beast Shapes',
    header: 'Druid Known Max Fly Level Forms CR Speed',
    columns: ['Druid Level', 'Known Forms', 'Max CR', 'Fly Speed'],
    row: /^(\d+) (\d+) ([\d/]+) (Yes|No)$/,
  },
  {
    title: 'Nature’s Ward',
    header: 'Land Type Resistance Land Type Resistance',
    columns: ['Land Type', 'Resistance'],
    row: /^(\w+) (\w+)(?: (\w+) (\w+))?$/,
  },
  {
    title: 'Creating Spell Slots',
    header: 'Spell Slot Sorcery Point Min. Sorcerer Level Cost Level',
    columns: ['Spell Slot Level', 'Sorcery Point Cost', 'Min. Sorcerer Level'],
    row: /^(\d) (\d+) (\d+)$/,
  },
  {
    title: 'Draconic Ancestors',
    header: 'Dragon Damage Type Dragon Damage Type',
    columns: ['Dragon', 'Damage Type'],
    row: /^(\w+) (\w+)(?: (\w+) (\w+))?$/,
  },
  {
    title: 'Elven Lineages',
    header: 'Lineage Level 1 Level 3 Level 5',
    columns: ['Lineage', 'Level 1', 'Level 3', 'Level 5'],
    row: /^(Drow|High Elf|Wood Elf) (.+) (Faerie Fire|Detect Magic|Longstrider) (Darkness|Misty Step|Pass without Trace)$/,
    wraps: 1,
  },
  {
    title: 'Fiendish Legacies',
    header: 'Legacy Level 1 Level 3 Level 5',
    columns: ['Legacy', 'Level 1', 'Level 3', 'Level 5'],
    row: /^(Abyssal|Chthonic|Infernal) (.+) (Ray of Sickness|False Life|Hellish Rebuke) (Hold Person|Ray of Enfeeblement|Darkness)$/,
    wraps: 1,
  },
];
