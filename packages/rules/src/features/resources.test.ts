import type { CharacterSheet, ClassId, ClassResource } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { elowen } from '../testing/elowen.ts';
import {
  afterLongRest,
  afterShortRest,
  classResources,
  pactSlots,
  resourceOf,
  spendResource,
} from './resources.ts';

/**
 * The class resources by level (docs/adr/0056-characters-from-the-srd.md §4), held to the SRD's
 * features tables and words, and what each rest gives back.
 */
const as = (classId: ClassId, level: number, changes: Partial<CharacterSheet> = {}) =>
  elowen({ classes: [{ classId, level }], ...changes });
const max = (sheet: CharacterSheet, resource: ClassResource) => resourceOf(sheet, resource)?.max;
const spent = (sheet: CharacterSheet, resource: ClassResource, amount = 1) => {
  const next = spendResource(sheet, resource, amount);
  if (typeof next === 'string') throw new Error(next);
  return next;
};

describe('class resources', () => {
  it('count by the features table and the words', () => {
    expect([1, 3, 6, 12, 17].map((level) => max(as('barbarian', level), 'rage'))).toEqual([
      2, 3, 4, 5, 6,
    ]);
    expect([1, 4, 10].map((level) => max(as('fighter', level), 'second-wind'))).toEqual([2, 3, 4]);
    expect([2, 17].map((level) => max(as('fighter', level), 'action-surge'))).toEqual([1, 2]);
    expect([9, 13, 17].map((level) => max(as('fighter', level), 'indomitable'))).toEqual([1, 2, 3]);
    expect([2, 6, 18].map((level) => max(as('cleric', level), 'channel-divinity'))).toEqual([
      2, 3, 4,
    ]);
    expect([3, 11].map((level) => max(as('paladin', level), 'channel-divinity'))).toEqual([2, 3]);
    expect([2, 6, 17].map((level) => max(as('druid', level), 'wild-shape'))).toEqual([2, 3, 4]);
    expect(max(as('monk', 7), 'focus')).toBe(7);
    expect(max(as('sorcerer', 7), 'sorcery-points')).toBe(7);
    expect(max(as('paladin', 4), 'lay-on-hands')).toBe(20);
    // As many as the Charisma modifier, at least one; Font of Inspiration's Short Rest from 5.
    const bard = as('bard', 5, { abilities: { ...elowen().abilities, cha: 18 } });
    expect(resourceOf(bard, 'bardic-inspiration')).toMatchObject({ max: 4, recharge: 'short-all' });
    expect(resourceOf(as('bard', 4), 'bardic-inspiration')?.recharge).toBe('long');
    // None before the level that gives it.
    expect(resourceOf(as('fighter', 1), 'action-surge')).toBeNull();
    expect(resourceOf(as('monk', 1), 'focus')).toBeNull();
  });

  it('gives one use back at a Short Rest or all, as each says; a Long Rest gives all', () => {
    let fighter = as('fighter', 4);
    fighter = spent(spent(spent(fighter, 'second-wind'), 'second-wind'), 'action-surge');
    expect(spendResource(fighter, 'action-surge')).toBe('NO_USES_LEFT');
    expect(spendResource(fighter, 'rage')).toBe('NOT_A_FEATURE');
    const short = afterShortRest(fighter);
    expect(short.featureUses).toEqual({ 'second-wind': 1 });
    expect(afterLongRest(short).featureUses).toBeUndefined();
    const paladin = spent(as('paladin', 4), 'lay-on-hands', 12);
    expect(resourceOf(paladin, 'lay-on-hands')?.left).toBe(8);
    expect(afterShortRest(paladin).featureUses).toEqual({ 'lay-on-hands': 12 });
    const raging = { ...as('barbarian', 3), raging: { since: 0 } };
    expect(afterLongRest(raging).raging).toBeUndefined();
  });

  it('gives a Warlock its Pact Magic slots back at a Short Rest', () => {
    const warlock = as('warlock', 5, {
      spellSlots: { max: [0, 0, 2, 0, 0, 0, 0, 0, 0], expended: [0, 0, 2, 0, 0, 0, 0, 0, 0] },
    });
    expect(pactSlots(warlock)).toEqual({ level: 3, count: 2 });
    expect(afterShortRest(warlock).spellSlots.expended[2]).toBe(0);
    expect(classResources(warlock).map((view) => view.resource)).toEqual(['magical-cunning']);
  });
});
