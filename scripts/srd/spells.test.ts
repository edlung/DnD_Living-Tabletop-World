import { describe, expect, it } from 'vitest';

import { parseSpells } from './spells.ts';

/** Spell descriptions as the import reads them (docs/adr/0051-srd-data.md §3). */
const LINES = [
  'Acid Arrow',
  'Level 2 Evocation (Wizard)',
  'Casting Time: Action',
  'Range: 90 feet',
  'Components: V, S, M (powdered rhubarb leaf)',
  'Duration: Instantaneous',
  'A shimmering green arrow streaks toward a target',
  'within range and bursts in a spray of acid.',
  'Using a Higher-Level Spell Slot. The damage in-',
  'creases by 1d4 for each spell slot level above 2.',
  'Alarm',
  'Level 1 Abjuration (Ranger, Wizard)',
  'Casting Time: 1 minute or Ritual',
  'Range: 30 feet',
  'Components: V, S, M (a bell and silver wire)',
  'Duration: 8 hours',
  'You set an alarm against intrusion.',
  'Audible Alarm. The alarm produces the sound of a',
  'handbell for 10 seconds within 60 feet.',
  'Counterspell',
  'Level 3 Abjuration (Sorcerer, Warlock,',
  'Wizard)',
  'Casting Time: Reaction, which you take when you',
  'see a creature within 60 feet of yourself casting a spell',
  'Range: 60 feet',
  'Component: S',
  'Duration: Instantaneous',
  'You attempt to interrupt a creature in the process of casting a spell.',
  'Revivify',
  'Level 3 Necromancy (Cleric, Druid, Paladin, Ranger)',
  'Casting Time: Action',
  'Range: Touch',
  'Components: V, S, M (a diamond worth 300+ GP, which',
  'the spell consumes)',
  'Duration: Instantaneous',
  'You touch a creature that has died within the last minute.',
  'Acid Splash',
  'Evocation Cantrip (Sorcerer, Wizard)',
  'Casting Time: Action',
  'Range: 60 feet',
  'Components: V, S',
  'Duration: Instantaneous',
  'You create an acidic bubble at a point within range.',
  'Cantrip Upgrade. The damage increases by 1d6 when',
  'you reach levels 5 (2d6), 11 (3d6), and 17 (4d6).',
];

describe('the spell descriptions', () => {
  const spells = parseSpells(LINES);
  const of = (id: string) => spells.find((spell) => spell.spellId === id);

  it('split at each header and read its fields', () => {
    expect(spells.map((spell) => spell.spellId)).toEqual([
      'acid-arrow',
      'alarm',
      'counterspell',
      'revivify',
      'acid-splash',
    ]);
    expect(of('acid-arrow')).toEqual({
      spellId: 'acid-arrow',
      name: 'Acid Arrow',
      level: 2,
      school: 'evocation',
      classes: ['wizard'],
      castingTime: 'Action',
      ritual: false,
      range: '90 feet',
      components: {
        verbal: true,
        somatic: true,
        material: 'powdered rhubarb leaf',
        costGp: null,
        consumed: false,
      },
      duration: 'Instantaneous',
      concentration: false,
      description:
        'A shimmering green arrow streaks toward a target within range and bursts in a spray of acid.',
      higherLevels:
        'Using a Higher-Level Spell Slot. The damage increases by 1d4 for each spell slot level above 2.',
    });
  });

  it('read a ritual, a run-in heading’s paragraph, wrapped fields and a cost', () => {
    expect(of('alarm')).toMatchObject({ ritual: true, castingTime: '1 minute' });
    expect(of('alarm')?.description).toBe(
      'You set an alarm against intrusion.\nAudible Alarm. The alarm produces the sound of a handbell for 10 seconds within 60 feet.',
    );
    expect(of('counterspell')).toMatchObject({
      classes: ['sorcerer', 'warlock', 'wizard'],
      castingTime:
        'Reaction, which you take when you see a creature within 60 feet of yourself casting a spell',
      components: { verbal: false, somatic: true, material: null },
    });
    expect(of('revivify')?.components).toEqual({
      verbal: true,
      somatic: true,
      material: 'a diamond worth 300+ GP, which the spell consumes',
      costGp: 300,
      consumed: true,
    });
    expect(of('acid-splash')).toMatchObject({ level: 0, school: 'evocation' });
    expect(of('acid-splash')?.higherLevels).toMatch(/^Cantrip Upgrade\. The damage increases/);
  });
});
