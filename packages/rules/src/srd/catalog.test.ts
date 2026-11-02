import { srdMonsterSchema, srdSpellSchema, type SrdMonster } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { SPELLS } from '../catalog.ts';
import { SRD_MONSTERS, SRD_SPELLS, srdMonster, srdSpell } from './catalog.ts';

/**
 * The SRD 5.2.1 catalogs as imported (docs/adr/0051-srd-data.md §2): each entry holds to its
 * schema, and the stat blocks' numbers agree with the SRD's own arithmetic — a check on the
 * import as much as on the data.
 */
describe('the spells', () => {
  it('are the SRD’s 339, each to its schema, ids unique', () => {
    expect(SRD_SPELLS).toHaveLength(339);
    for (const spell of SRD_SPELLS) expect(srdSpellSchema.safeParse(spell).error).toBeUndefined();
    expect(new Set(SRD_SPELLS.map((spell) => spell.spellId)).size).toBe(339);
    const levels = SRD_SPELLS.reduce<number[]>((counts, spell) => {
      counts[spell.level] = (counts[spell.level] ?? 0) + 1;
      return counts;
    }, []);
    expect(levels).toEqual([27, 57, 57, 42, 34, 38, 31, 20, 17, 16]);
  });

  it('hold the slice’s spells at the levels the slice gives them', () => {
    for (const slice of Object.values(SPELLS)) {
      expect(srdSpell(slice.spellId)?.level).toBe(slice.level);
      expect(srdSpell(slice.spellId)?.concentration).toBe(slice.concentration);
    }
  });

  it('read their fields as the SRD prints them', () => {
    expect(srdSpell('fireball')).toMatchObject({
      name: 'Fireball',
      school: 'evocation',
      classes: ['sorcerer', 'wizard'],
      castingTime: 'Action',
      range: '150 feet',
      components: { verbal: true, somatic: true, material: 'a ball of bat guano and sulfur' },
      duration: 'Instantaneous',
    });
    expect(srdSpell('counterspell')?.castingTime).toMatch(/^Reaction, which you take when/);
    expect(srdSpell('alarm')).toMatchObject({ ritual: true, castingTime: '1 minute' });
    expect(srdSpell('revivify')?.components).toMatchObject({ costGp: 300, consumed: true });
    expect(srdSpell('rope-trick')?.description).toContain('extradimensional space');
  });
});

/** XP by challenge rating (SRD 5.2.1, "Monsters": Experience Points by Challenge Rating). */
const XP: Readonly<Record<string, number>> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};
const RATINGS = Object.keys(XP);
const crValue = (rating: string) => {
  const [top, bottom] = rating.split('/').map(Number);
  return bottom === undefined ? (top ?? 0) : (top ?? 0) / bottom;
};
/** The proficiency bonus a challenge rating gives: +2 to CR 4, one more each 4 ratings. */
const proficiencyOf = (rating: string) => Math.max(2, Math.ceil(crValue(rating) / 4) + 1);
/** "20d10 + 40" → 150, "1d4 − 1" → 1: the average the SRD rounds down. */
function averageOf(dice: string): number {
  const match = /^(\d+)d(\d+)(?: ([+−]) (\d+))?$/.exec(dice);
  if (!match) throw new Error(`unread dice ${dice}`);
  const bonus = Number(match[4] ?? 0) * (match[3] === '−' ? -1 : 1);
  return Math.floor((Number(match[1]) * (Number(match[2]) + 1)) / 2 + bonus);
}
const each = (check: (monster: SrdMonster) => boolean) =>
  SRD_MONSTERS.filter((monster) => !check(monster)).map((monster) => monster.name);

describe('the stat blocks', () => {
  it('are the SRD’s 330, each to its schema, ids unique', () => {
    expect(SRD_MONSTERS).toHaveLength(330);
    for (const monster of SRD_MONSTERS)
      expect(srdMonsterSchema.safeParse(monster).error).toBeUndefined();
    expect(new Set(SRD_MONSTERS.map((monster) => monster.monsterId)).size).toBe(330);
  });

  it('give each modifier from its score, each save as the modifier or plus the bonus', () => {
    const abilities = (monster: SrdMonster) => Object.values(monster.abilities);
    expect(
      each((m) => abilities(m).every((a) => a.modifier === Math.floor((a.score - 10) / 2))),
    ).toEqual([]);
    expect(
      each((m) =>
        abilities(m).every(
          (a) => a.save === a.modifier || a.save === a.modifier + m.challenge.proficiency,
        ),
      ),
    ).toEqual([]);
    expect(each((m) => m.initiative.score === 10 + m.initiative.modifier)).toEqual([]);
  });

  it('give the proficiency bonus and XP of their rating, and the hit points of their dice', () => {
    expect(each((m) => m.challenge.proficiency === proficiencyOf(m.challenge.rating))).toEqual([]);
    // A CR 0 creature is worth 10 XP or none (one that has no effective attacks).
    expect(
      each(
        (m) =>
          m.challenge.xp === XP[m.challenge.rating] ||
          (m.challenge.rating === '0' && m.challenge.xp === 0),
      ),
    ).toEqual([]);
    // In its lair a creature is worth the XP of the next rating.
    expect(
      each(
        (m) =>
          m.challenge.xpInLair === null ||
          m.challenge.xpInLair === XP[RATINGS[RATINGS.indexOf(m.challenge.rating) + 1] ?? ''],
      ),
    ).toEqual([]);
    expect(each((m) => m.hitPoints.average === averageOf(m.hitPoints.dice))).toEqual([]);
  });

  it('read a block’s lines and its sections', () => {
    const dragon = srdMonster('adult-red-dragon');
    expect(dragon).toMatchObject({
      size: 'Huge',
      type: 'Dragon (Chromatic)',
      armorClass: 19,
      initiative: { modifier: 12, score: 22 },
      hitPoints: { average: 256, dice: '19d12 + 133' },
      speed: '40 ft., Climb 40 ft., Fly 80 ft.',
      challenge: { rating: '17', xp: 18000, xpInLair: 20000, proficiency: 6 },
    });
    expect(dragon?.actions.map((action) => action.name)).toEqual([
      'Multiattack',
      'Rend',
      'Fire Breath (Recharge 5–6)',
      'Spellcasting',
    ]);
    expect(dragon?.legendary?.uses).toMatch(/^3 \(4 in Lair\)\. Immediately after/);
    expect(srdMonster('wolf')?.actions.map((action) => action.name)).toEqual(['Bite']);
    expect(srdMonster('goblin-warrior')?.bonusActions.map((action) => action.name)).toEqual([
      'Nimble Escape',
    ]);
    // The SRD's misprints, put right by the import: an Initiative score, a save's sign.
    expect(srdMonster('gray-ooze')?.initiative).toEqual({ modifier: -2, score: 8 });
    expect(srdMonster('young-white-dragon')?.abilities.int.save).toBe(-2);
  });
});
