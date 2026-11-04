import { describe, expect, it } from 'vitest';

import { parseMonsters } from './monsters.ts';
import type { SrdLine } from './text.ts';

/** Stat blocks as the import reads them (docs/adr/0051-srd-data.md §3), from SRD 5.2.1 lines. */
const plain = (text: string): SrdLine => ({ text, lead: null, label: null });
const named = (lead: string, rest: string): SrdLine => ({
  text: `${lead} ${rest}`,
  lead,
  label: null,
});

const WOLF: readonly SrdLine[] = [
  plain('Wolf'),
  plain('Medium Beast, Unaligned'),
  plain('AC 12 Initiative +2 (12)'),
  plain('HP 11 (2d8 + 2)'),
  plain('Speed 40 ft.'),
  plain('MOD SAVE MOD SAVE MOD SAVE'),
  plain('Str 14 +2 +2 Dex 15 +2 +2 Con 12 +1 +1'),
  plain('Int 3 −4 −4 WIS 12 +1 +1 Cha 6 −2 −2'),
  plain('Skills Perception +5, Stealth +4'),
  plain('Senses Darkvision 60 ft.; Passive Perception 15'),
  plain('Languages None'),
  plain('CR 1/4 (XP 50; PB +2)'),
  plain('Traits'),
  named('Pack Tactics.', 'The wolf has Advantage on attack rolls'),
  plain('against a creature if at least one of the wolf’s allies is'),
  plain('within 5 feet of the creature.'),
  plain('Actions'),
  named('Bite.', 'Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2)'),
  plain('Piercing damage. If the target is a Medium or smaller'),
  plain('creature, it has the Prone condition.'),
];

describe('a stat block', () => {
  it('reads its lines, its abilities and its named entries', () => {
    const [wolf] = parseMonsters(WOLF);
    expect(wolf).toMatchObject({
      monsterId: 'wolf',
      size: 'Medium',
      type: 'Beast',
      alignment: 'Unaligned',
      armorClass: 12,
      initiative: { modifier: 2, score: 12 },
      hitPoints: { average: 11, dice: '2d8 + 2' },
      speed: '40 ft.',
      skills: 'Perception +5, Stealth +4',
      immunities: null,
      senses: 'Darkvision 60 ft.; Passive Perception 15',
      languages: 'None',
      challenge: { rating: '1/4', xp: 50, xpInLair: null, proficiency: 2 },
      bonusActions: [],
      legendary: null,
    });
    expect(wolf?.abilities.int).toEqual({ score: 3, modifier: -4, save: -4 });
    expect(wolf?.traits).toEqual([
      {
        name: 'Pack Tactics',
        text: 'The wolf has Advantage on attack rolls against a creature if at least one of the wolf’s allies is within 5 feet of the creature.',
      },
    ]);
    // A wrapped line that opens like a name ("Piercing damage.") is no entry: names are bold italic.
    expect(wolf?.actions.map((action) => action.name)).toEqual(['Bite']);
  });

  it('splits blocks at their type lines, and reads a spell list and legendary actions', () => {
    const lines: readonly SrdLine[] = [
      ...WOLF,
      plain('Old Wyrm'),
      plain('Huge Dragon (Chromatic), Chaotic Evil'),
      plain('AC 19 Initiative +12 (22)'),
      plain('HP 256 (19d12 + 133)'),
      plain('Speed 40 ft., Climb 40 ft., Fly'),
      plain('80 ft.'),
      plain('Str 27 +8 +8 Dex 10 +0 +6 Con 25 +7 +7'),
      plain('Int 16 +3 +3 WIS 13 +1 +7 Cha 23 +6 +6'),
      plain('Senses Blindsight 60 ft., Darkvision 120 ft.;'),
      plain('Passive Perception 23'),
      plain('Languages Common, Draconic'),
      plain('CR 17 (XP 18,000, or 20,000 in lair; PB +6)'),
      plain('Actions'),
      named('Spellcasting.', 'The dragon casts one of the following'),
      plain('spells (spell save DC 21):'),
      { text: 'At Will: Command, Detect Magic', lead: null, label: 'At Will:' },
      { text: '1/Day Each: Fireball, Scorching Ray', lead: null, label: '1/Day Each:' },
      plain('Legendary Actions'),
      plain('Legendary Action Uses: 3 (4 in Lair). Immediately after'),
      plain('another creature’s turn, the dragon can expend a use.'),
      named('Pounce.', 'The dragon moves up to half its Speed.'),
    ];
    const [, wyrm] = parseMonsters(lines);
    expect(wyrm).toMatchObject({
      monsterId: 'old-wyrm',
      type: 'Dragon (Chromatic)',
      speed: '40 ft., Climb 40 ft., Fly 80 ft.',
      senses: 'Blindsight 60 ft., Darkvision 120 ft.; Passive Perception 23',
      challenge: { rating: '17', xp: 18000, xpInLair: 20000, proficiency: 6 },
    });
    expect(wyrm?.actions[0]?.text).toBe(
      'The dragon casts one of the following spells (spell save DC 21):\nAt Will: Command, Detect Magic\n1/Day Each: Fireball, Scorching Ray',
    );
    expect(wyrm?.legendary).toEqual({
      uses: '3 (4 in Lair). Immediately after another creature’s turn, the dragon can expend a use.',
      entries: [{ name: 'Pounce', text: 'The dragon moves up to half its Speed.' }],
    });
  });

  it('puts right the SRD’s misprints by name, and stops at a block it cannot read', () => {
    const ooze = WOLF.map((line, index) =>
      index === 0 ? plain('Gray Ooze') : index === 2 ? plain('AC 9 Initiative −2 (13)') : line,
    );
    expect(parseMonsters(ooze)[0]?.initiative).toEqual({ modifier: -2, score: 8 });
    const broken = WOLF.filter((line) => !line.text.startsWith('Int '));
    expect(() => parseMonsters(broken)).toThrow('monster "Wolf" has unreadable abilities');
    const stray = [...WOLF.slice(0, 12), plain('A stray line'), ...WOLF.slice(12)];
    expect(() => parseMonsters(stray)).toThrow('text outside a section');
  });
});
