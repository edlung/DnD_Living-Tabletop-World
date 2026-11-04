import { describe, expect, it } from 'vitest';

import { animatedSizes, summonedBodies, summonProblem, type SummonedBody } from './summons.ts';

/**
 * The summoned creatures' stat blocks (SRD 5.2.1; docs/adr/0056-characters-from-the-srd.md §5):
 * the numbers each spell's block gives at the slot it was cast with, the caster's spell attack and
 * save DC in its actions, and its name in the campaign's language.
 */
const caster = (level: number, modifier = 4) => ({
  level,
  attackBonus: 9,
  saveDc: 17,
  modifier,
});
const mark = { by: 'wizard-1', spellId: 'a-spell' };

function bodies(...args: Parameters<typeof summonedBodies>): readonly SummonedBody[] {
  const made = summonedBodies(...args);
  if (typeof made === 'string') throw new Error(made);
  return made;
}

describe('the Otherworldly Steed', () => {
  it('scales with the slot, flies from the 4th, and strikes as its creature type', () => {
    const [low] = bodies('otherworldly-steed', { option: 'fiend' }, caster(2), mark, 'en');
    expect(low?.name).toBe('Otherworldly Steed (Fiend)');
    expect(low?.block).toMatchObject({ armorClass: 12, hitPoints: { max: 25 }, speedFt: 60 });
    expect(low?.block.speeds).toBeUndefined();
    expect(low?.block.attacks[0]).toMatchObject({
      bonus: 9,
      reachFt: 5,
      damage: { count: 1, sides: 8, bonus: 2, type: 'necrotic' },
    });
    const [high] = bodies('otherworldly-steed', { option: 'celestial' }, caster(4), mark, 'ru');
    expect(high?.name).toBe('Потусторонний скакун (Небожитель)');
    expect(high?.block.speeds).toEqual({ fly: 60 });
    expect(high?.block.attacks[0]?.name).toBe('Потусторонний удар');
  });
});

describe('the Giant Insect', () => {
  it('makes half the level’s attacks; a spider has its Web Bolt, a wasp its wings', () => {
    const [spider] = bodies('giant-insect', { option: 'spider' }, caster(7), mark, 'en');
    expect(spider?.block).toMatchObject({
      armorClass: 18,
      hitPoints: { max: 60 },
      attacksPerAction: 3,
      speeds: { climb: 40 },
    });
    expect(spider?.block.attacks.map((one) => one.attackId)).toEqual(['poison-jab', 'web-bolt']);
    expect(spider?.block.attacks[0]?.extraDamage).toEqual([
      { count: 1, sides: 4, bonus: 0, type: 'poison' },
    ]);
    const [wasp] = bodies('giant-insect', { option: 'wasp' }, caster(4), mark, 'en');
    expect(wasp?.block.speeds).toEqual({ fly: 40, climb: 40 });
    expect(wasp?.block.attacks.map((one) => one.attackId)).toEqual(['poison-jab']);
  });
});

describe('the Draconic Spirit', () => {
  it('breathes its chosen type with its Rends, against the caster’s DC', () => {
    const [spirit] = bodies('draconic-spirit', { option: 'lightning' }, caster(7), mark, 'en');
    expect(spirit?.block).toMatchObject({
      armorClass: 21,
      hitPoints: { max: 70 },
      attacksPerAction: 3,
      speeds: { fly: 60, swim: 30 },
    });
    expect(spirit?.block.saveActions?.[0]).toMatchObject({
      ability: 'dex',
      dc: 17,
      area: { shape: 'cone', sizeFt: 30, origin: 'self' },
      damage: [{ count: 2, sides: 6, bonus: 0, type: 'lightning' }],
      onSuccess: 'half',
      inMultiattack: true,
    });
  });
});

describe('the Animated Objects', () => {
  it('weigh against the modifier, a Large one two and a Huge one three', () => {
    expect(summonProblem('animated-object', { objects: { medium: 2, large: 1, huge: 0 } }, 4)).toBe(
      null,
    );
    expect(summonProblem('animated-object', { objects: { medium: 2, large: 0, huge: 1 } }, 4)).toBe(
      'SUMMON_CHOICE',
    );
    expect(summonProblem('animated-object', { objects: { medium: 0, large: 0, huge: 0 } }, 4)).toBe(
      'SUMMON_CHOICE',
    );
    // A modifier below 1 still animates one Medium object.
    expect(summonProblem('animated-object', { objects: { medium: 1, large: 0, huge: 0 } }, 0)).toBe(
      null,
    );
    expect(animatedSizes({ objects: { medium: 1, large: 0, huge: 1 } })).toEqual([
      'huge',
      'medium',
    ]);
  });

  it('slam harder for their size and the slot above the 5th', () => {
    const made = bodies(
      'animated-object',
      { objects: { medium: 1, large: 0, huge: 1 } },
      caster(7),
      mark,
      'en',
    );
    expect(
      made.map((one) => [one.name, one.block.hitPoints.max, one.block.attacks[0]?.damage]),
    ).toEqual([
      ['Animated Object (Huge) 1', 40, { count: 4, sides: 12, bonus: 7, type: 'force' }],
      ['Animated Object (Medium) 2', 10, { count: 3, sides: 4, bonus: 3, type: 'force' }],
    ]);
    expect(made[0]?.block).toMatchObject({
      armorClass: 15,
      size: 'huge',
      immunities: ['poison', 'psychic'],
      senses: { blindsight: 30 },
    });
  });
});

describe('a choice its creature has not', () => {
  it('calls up nothing', () => {
    expect(summonProblem('otherworldly-steed', { option: 'spider' }, 4)).toBe('SUMMON_CHOICE');
    expect(summonProblem('giant-insect', {}, 4)).toBe('SUMMON_CHOICE');
    expect(summonProblem('draconic-spirit', { objects: { medium: 1, large: 0, huge: 0 } }, 4)).toBe(
      'SUMMON_CHOICE',
    );
  });
});
