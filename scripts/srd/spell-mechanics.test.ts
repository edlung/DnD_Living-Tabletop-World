import { describe, expect, it } from 'vitest';

import {
  areaOf,
  castingTimeOf,
  deriveMechanics,
  diceOf,
  durationOf,
  effectOf,
  rangeOf,
  targetCountOf,
  upcastOf,
} from './spell-mechanics.ts';
import type { SrdSpellText } from './spells.ts';

/** A spell's mechanics read from its text (docs/adr/0052-spells-as-data.md §2–4). */
const spell = (fields: Partial<SrdSpellText>): SrdSpellText => ({
  spellId: 'test-spell',
  name: 'Test Spell',
  level: 1,
  school: 'evocation',
  classes: ['wizard'],
  castingTime: 'Action',
  ritual: false,
  range: '60 feet',
  components: { verbal: true, somatic: true, material: null, costGp: null, consumed: false },
  duration: 'Instantaneous',
  concentration: false,
  description: '',
  higherLevels: null,
  ...fields,
});

describe('a spell’s header fields', () => {
  it('reads casting times, ranges, durations and dice', () => {
    expect(castingTimeOf('Bonus Action')).toEqual({ unit: 'bonus', amount: 1 });
    expect(castingTimeOf('Reaction, which you take when you see a creature')).toEqual({
      unit: 'reaction',
      amount: 1,
    });
    expect(castingTimeOf('10 minutes')).toEqual({ unit: 'minute', amount: 10 });
    expect(rangeOf('150 feet')).toEqual({ kind: 'feet', amount: 150 });
    expect(rangeOf('1 mile')).toEqual({ kind: 'miles', amount: 1 });
    expect(rangeOf('Touch')).toEqual({ kind: 'touch', amount: null });
    expect(durationOf('Concentration, up to 1 minute')).toEqual({ unit: 'minute', amount: 1 });
    expect(durationOf('Until dispelled or triggered')).toEqual({
      unit: 'until-dispelled',
      amount: null,
    });
    expect(diceOf('2d4 + 4')).toEqual({ count: 2, sides: 4, bonus: 4 });
    expect(diceOf('1d4 − 1')).toEqual({ count: 1, sides: 4, bonus: -1 });
    expect(() => castingTimeOf('Whenever you like')).toThrow('unread casting time');
  });

  it('reads areas from the description, from a point or from the caster', () => {
    const at = (description: string, range = '150 feet') => areaOf(spell({ description, range }));
    expect(at('Each creature in a 20-foot-radius Sphere centered on that point')).toEqual({
      shape: 'sphere',
      sizeFt: 20,
      widthFt: null,
      origin: 'point',
    });
    expect(at('Each creature in a 15-foot Cone makes a save', 'Self')).toMatchObject({
      shape: 'cone',
      origin: 'self',
    });
    expect(at('Protective spirits in a 15-foot Emanation', 'Self')).toMatchObject({
      shape: 'emanation',
      sizeFt: 15,
    });
    expect(at('a 100-foot-long, 5-foot-wide Line blasts out from you', 'Self')).toEqual({
      shape: 'line',
      sizeFt: 100,
      widthFt: 5,
      origin: 'self',
    });
    expect(at('a 10-foot-radius, 40-foot-high Cylinder centered on a point')).toMatchObject({
      shape: 'cylinder',
      sizeFt: 10,
    });
    expect(targetCountOf('You bless up to three creatures within range.')).toBe(3);
    expect(targetCountOf('Up to six creatures of your choice')).toBe(6);
  });
});

describe('a spell’s effect', () => {
  it('a save for half, a save or nothing, and the condition a failure brings', () => {
    expect(
      effectOf(
        spell({
          description:
            'Each creature in a 20-foot-radius Sphere makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save or half as much damage on a successful one.',
        }),
      ),
    ).toEqual({
      kind: 'save',
      ability: 'dex',
      damage: [{ dice: { count: 8, sides: 6, bonus: 0 }, type: 'fire' }],
      onSuccess: 'half',
      condition: null,
      repeatSave: false,
    });
    expect(
      effectOf(
        spell({
          description:
            'The target must succeed on a Dexterity saving throw or take 1d8 Radiant damage.',
        }),
      ),
    ).toMatchObject({ onSuccess: 'none', damage: [{ type: 'radiant' }] });
    expect(
      effectOf(
        spell({
          description:
            'The target must succeed on a Wisdom saving throw or have the Paralyzed condition for the duration. At the end of each of its turns, the target repeats the save, ending the spell on itself on a success.',
        }),
      ),
    ).toEqual({
      kind: 'save',
      ability: 'wis',
      damage: [],
      onSuccess: 'none',
      condition: 'paralyzed',
      repeatSave: true,
    });
    // A choice of conditions is the DM's.
    expect(
      effectOf(
        spell({
          description:
            'One creature must succeed on a Constitution saving throw, or it has the Blinded or Deafened condition (your choice) for the duration.',
        }),
      ),
    ).toEqual({ kind: 'dm' });
  });

  it('an attack, healing, temporary hit points, and nothing it can compute', () => {
    expect(
      effectOf(
        spell({
          description:
            'Make a ranged spell attack against the target. On a hit, the target takes 1d10 Fire damage.',
        }),
      ),
    ).toEqual({
      kind: 'attack',
      attack: 'ranged',
      damage: [{ dice: { count: 1, sides: 10, bonus: 0 }, type: 'fire' }],
    });
    expect(
      effectOf(
        spell({
          description:
            'A creature you touch regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier.',
        }),
      ),
    ).toEqual({ kind: 'heal', dice: { count: 2, sides: 8, bonus: 0 }, modifier: true });
    expect(effectOf(spell({ description: 'You gain 2d4 + 4 Temporary Hit Points.' }))).toEqual({
      kind: 'temp-hp',
      dice: { count: 2, sides: 4, bonus: 4 },
    });
    expect(effectOf(spell({ description: 'You touch a closed door.' }))).toEqual({ kind: 'dm' });
  });

  it('a higher slot’s dice, healing and targets; the curated table and the slice', () => {
    expect(
      upcastOf(
        spell({
          level: 4,
          higherLevels:
            'Using a Higher-Level Spell Slot. The Bludgeoning damage increases by 1d10 for each spell slot level above 4.',
        }),
      ),
    ).toEqual({
      dice: { count: 1, sides: 10, bonus: 0 },
      damageType: 'bludgeoning',
      targets: null,
      darts: null,
    });
    expect(
      upcastOf(
        spell({
          higherLevels:
            'Using a Higher-Level Spell Slot. You can target one additional creature for each spell slot level above 1.',
        }),
      ),
    ).toMatchObject({ dice: null, targets: 1 });
    const missile = deriveMechanics(spell({ spellId: 'magic-missile', description: 'Darts.' }));
    expect(missile).toMatchObject({
      effect: { kind: 'auto', darts: 3 },
      upcast: { darts: 1 },
      complete: true,
    });
    const fireball = deriveMechanics(
      spell({ spellId: 'fireball', level: 3, description: 'A blast.' }),
    );
    expect(fireball.slice).toBe(true);
  });
});
