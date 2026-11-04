import {
  COMBAT_ACTIONS,
  CONDITIONS,
  srdAbbreviationSchema,
  srdGlossaryEntrySchema,
  srdRulesSectionSchema,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  SRD_ABBREVIATIONS,
  SRD_GLOSSARY,
  SRD_RULES_SECTIONS,
  srdGlossaryEntry,
  srdRulesSection,
} from './reference.ts';

/**
 * The SRD's rules as a reference (docs/adr/0055-rules-reference-and-toolbox.md §1): every entry
 * and section holds to its schema, the game's conditions and actions each have their entry, and
 * what an entry points to is there.
 */
const blocks = [...SRD_GLOSSARY, ...SRD_RULES_SECTIONS].flatMap((one) => one.blocks);

describe('the SRD rules reference', () => {
  it('holds every entry, abbreviation and section to its schema', () => {
    for (const entry of SRD_GLOSSARY) srdGlossaryEntrySchema.parse(entry);
    for (const abbreviation of SRD_ABBREVIATIONS) srdAbbreviationSchema.parse(abbreviation);
    for (const section of SRD_RULES_SECTIONS) srdRulesSectionSchema.parse(section);
    expect(SRD_GLOSSARY).toHaveLength(155);
    expect(SRD_ABBREVIATIONS).toHaveLength(33);
    expect(SRD_RULES_SECTIONS.length).toBeGreaterThan(110);
    expect(new Set(SRD_GLOSSARY.map((entry) => entry.entryId)).size).toBe(SRD_GLOSSARY.length);
  });

  it('has an entry for every condition and action the game applies', () => {
    for (const condition of CONDITIONS.filter((id) => id !== 'slowed'))
      expect(srdGlossaryEntry(condition)?.tag, condition).toBe('Condition');
    expect(srdGlossaryEntry('exhaustion')?.tag).toBe('Condition');
    const actions = COMBAT_ACTIONS.filter(
      (id) => !['escape', 'release', 'first-aid', 'mount', 'dismount'].includes(id),
    );
    for (const action of [...actions, 'attack', 'magic'])
      expect(srdGlossaryEntry(action)?.tag, action).toBe('Action');
  });

  it('reads Prone as the SRD gives it, its run-in heads apart', () => {
    const prone = srdGlossaryEntry('prone');
    expect(prone?.blocks.map((block) => (block.kind === 'paragraph' ? block.head : null))).toEqual([
      null,
      'Restricted Movement',
      'Attacks Affected',
    ]);
    expect(srdGlossaryEntry('action')?.blocks[1]).toEqual({
      kind: 'names',
      names: [
        'Attack',
        'Dash',
        'Disengage',
        'Dodge',
        'Help',
        'Hide',
        'Influence',
        'Magic',
        'Ready',
        'Search',
        'Study',
        'Utilize',
      ],
    });
  });

  it('points only to entries that are there', () => {
    for (const entry of SRD_GLOSSARY)
      for (const id of entry.seeAlso)
        expect(srdGlossaryEntry(id), `${entry.entryId} → ${id}`).toBeDefined();
    // The actions an Action names and the shapes of an Area of Effect are entries of their own; a
    // list may also name what has none (the creature types).
    const names = new Set(SRD_GLOSSARY.map((entry) => entry.name));
    for (const id of ['action', 'area-of-effect'])
      for (const block of srdGlossaryEntry(id)?.blocks ?? [])
        if (block.kind === 'names') for (const name of block.names) expect(names).toContain(name);
    const types = srdGlossaryEntry('creature-type')?.blocks.find((block) => block.kind === 'names');
    expect(types?.kind === 'names' ? types.names : []).toContain('Aberration');
  });

  it('reads every table into its columns', () => {
    const tables = blocks.filter((block) => block.kind === 'table');
    expect(tables).toHaveLength(27);
    for (const table of tables)
      for (const row of table.rows)
        expect(row, table.title ?? '').toHaveLength(table.columns.length);
    const terrain = tables.find((table) => table.title === 'Travel Terrain');
    expect(terrain?.rows).toHaveLength(11);
    expect(terrain?.rows[0]).toEqual(['Arctic', 'Fast*', '6d6 × 10 feet', '20', '10', '10']);
    const budget = tables.find((table) => table.title === 'XP Budget per Character');
    expect(budget?.rows[16]).toEqual(['17', '4,500', '7,200', '11,700']);
  });

  it('gives the toolbox its traps, contagions and poisons', () => {
    const traps = SRD_RULES_SECTIONS.filter((section) => section.subtitle?.includes(' Trap '));
    expect(traps.map((trap) => trap.title)).toEqual([
      'Collapsing Roof',
      'Falling Net',
      'Fire-Casting Statue',
      'Hidden Pit',
      'Poisoned Darts',
      'Poisoned Needle',
      'Rolling Stone',
      'Spiked Pit',
    ]);
    const contagions = SRD_RULES_SECTIONS.filter(
      (section) => section.subtitle === 'Magical Contagion',
    );
    expect(contagions.map((one) => one.title)).toEqual([
      'Cackle Fever',
      'Sewer Plague',
      'Sight Rot',
    ]);
    const poisons = SRD_RULES_SECTIONS.filter((section) => section.subtitle?.endsWith(' Poison'));
    expect(poisons).toHaveLength(14);
    expect(srdRulesSection('collapsing-roof')?.blocks[0]).toEqual({
      kind: 'paragraph',
      head: 'Trigger:',
      text: 'A creature crosses a trip wire',
    });
    expect(srdRulesSection('magic-item-rules')?.part).toBe('magic-items');
  });
});
