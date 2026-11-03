import { srdClassSchema } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { SRD_CLASSES, srdClass } from './classes.ts';

/**
 * The SRD's classes hold to their own tables (docs/adr/0056-characters-from-the-srd.md §1): every
 * class to its schema, the proficiency bonus by level, each feature its table names described, and
 * the full casters' spell slots the same table.
 */
const PROFICIENCY = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];
const FULL_CASTER_SLOTS = [
  '2',
  '3',
  '4 2',
  '4 3',
  '4 3 2',
  '4 3 3',
  '4 3 3 1',
  '4 3 3 2',
  '4 3 3 3 1',
  '4 3 3 3 2',
  '4 3 3 3 2 1',
  '4 3 3 3 2 1',
  '4 3 3 3 2 1 1',
  '4 3 3 3 2 1 1',
  '4 3 3 3 2 1 1 1',
  '4 3 3 3 2 1 1 1',
  '4 3 3 3 2 1 1 1 1',
  '4 3 3 3 3 1 1 1 1',
  '4 3 3 3 3 2 1 1 1',
  '4 3 3 3 3 2 2 1 1',
];

describe('the SRD’s classes', () => {
  it('are the twelve, each to its schema, its subclass with features', () => {
    expect(SRD_CLASSES.map((one) => one.name)).toEqual([
      'Barbarian',
      'Bard',
      'Cleric',
      'Druid',
      'Fighter',
      'Monk',
      'Paladin',
      'Ranger',
      'Rogue',
      'Sorcerer',
      'Warlock',
      'Wizard',
    ]);
    for (const one of SRD_CLASSES) {
      srdClassSchema.parse(one);
      expect(
        one.levels.map((level) => level.proficiencyBonus),
        one.name,
      ).toEqual(PROFICIENCY);
      expect(one.levels.map((level) => level.level)).toEqual(PROFICIENCY.map((_, at) => at + 1));
      expect(
        one.levels.every((level) => level.values.length === one.columns.length),
        one.name,
      ).toBe(true);
    }
  });

  it('describes every feature its table names', () => {
    for (const one of SRD_CLASSES) {
      const named = new Set(one.features.map((feature) => feature.name.toLowerCase()));
      for (const level of one.levels)
        for (const feature of level.features) {
          if (/^Subclass feature$|^Ability Score Improvement$|^Epic Boon$/i.test(feature)) continue;
          // A later use's count stays in the table only: "Action Surge (two uses)".
          expect(
            named.has(feature.replace(/\s*\([^)]*\)$/, '').toLowerCase()),
            `${one.name} ${String(level.level)}: ${feature}`,
          ).toBe(true);
        }
    }
  });

  it('keeps a second class’s gains, the sidebars and the options apart from the features', () => {
    for (const one of SRD_CLASSES)
      expect(
        one.multiclass.some((block) => block.kind === 'item' && /^Gain the /.test(block.text)),
        one.name,
      ).toBe(true);
    expect(SRD_CLASSES.flatMap((one) => one.sidebars.map((sidebar) => sidebar.title))).toEqual([
      'Breaking Your Oath',
      'Expanding and Replacing a Spellbook',
    ]);
    const metamagic = srdClass('sorcerer')?.options;
    expect(metamagic?.title).toBe('Metamagic Options');
    expect(metamagic?.entries).toHaveLength(10);
    expect(metamagic?.entries.every((option) => /Sorcery Points?$/.test(option.cost ?? ''))).toBe(
      true,
    );
    const invocations = srdClass('warlock')?.options?.entries ?? [];
    expect(invocations).toHaveLength(28);
    expect(invocations.find((one) => one.name === 'Devouring Blade')?.prerequisite).toBe(
      'Level 12+ Warlock, Thirsting Blade Invocation',
    );
    expect(invocations.filter((one) => one.repeatable).map((one) => one.name)).toEqual([
      'Agonizing Blast',
      'Eldritch Spear',
      'Lessons of the First Ones',
      'Repelling Blast',
    ]);
    // The last feature before the options ends where they begin.
    const last = srdClass('warlock')?.features.at(-1);
    expect(last?.name).toBe('Eldritch Master');
    expect(last?.blocks).toHaveLength(1);
    expect(SRD_CLASSES.filter((one) => one.options === null)).toHaveLength(10);
    for (const one of SRD_CLASSES) expect(one.subclass.tagline, one.name).not.toBeNull();
  });

  it('gives the full casters the same slots by level', () => {
    for (const id of ['bard', 'cleric', 'druid', 'sorcerer', 'wizard']) {
      const one = srdClass(id);
      const at = one?.columns.indexOf('1') ?? -1;
      const slots = one?.levels.map((level) =>
        level.values
          .slice(at)
          .filter((value) => value !== '—')
          .join(' '),
      );
      expect(slots, id).toEqual(FULL_CASTER_SLOTS);
    }
  });
});
