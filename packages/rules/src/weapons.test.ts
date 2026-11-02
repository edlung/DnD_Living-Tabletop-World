import { WEAPON_IDS } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { masteryCount, masteryOf, weaponMasteriesOf } from './masteries.ts';
import { WEAPONS } from './weapons.ts';

/** The SRD 5.2.1 weapon table, firearms apart (docs/adr/0047-weapons.md): masteries and more. */
const MASTERIES = {
  club: 'slow',
  dagger: 'nick',
  greatclub: 'push',
  handaxe: 'vex',
  javelin: 'slow',
  'light-hammer': 'nick',
  mace: 'sap',
  quarterstaff: 'topple',
  sickle: 'nick',
  spear: 'sap',
  dart: 'vex',
  'light-crossbow': 'slow',
  shortbow: 'vex',
  sling: 'slow',
  battleaxe: 'topple',
  flail: 'sap',
  glaive: 'graze',
  greataxe: 'cleave',
  greatsword: 'graze',
  halberd: 'cleave',
  lance: 'topple',
  longsword: 'sap',
  maul: 'topple',
  morningstar: 'sap',
  pike: 'push',
  rapier: 'vex',
  scimitar: 'nick',
  shortsword: 'vex',
  trident: 'topple',
  warhammer: 'push',
  'war-pick': 'sap',
  whip: 'slow',
  blowgun: 'vex',
  'hand-crossbow': 'vex',
  'heavy-crossbow': 'push',
  longbow: 'slow',
} as const;

describe('the weapon table', () => {
  it('gives every weapon its SRD mastery', () => {
    expect(Object.keys(MASTERIES).sort()).toEqual([...WEAPON_IDS].sort());
    for (const id of WEAPON_IDS) expect(WEAPONS[id].mastery, id).toBe(MASTERIES[id]);
  });

  it('holds each property’s numbers: reach, the Versatile die, Thrown ranges, ammunition', () => {
    for (const id of WEAPON_IDS) {
      const weapon = WEAPONS[id];
      const has = (property: (typeof weapon.properties)[number]) =>
        weapon.properties.includes(property);
      expect(weapon.versatileSides !== undefined, id).toBe(has('versatile'));
      expect(weapon.thrownRange !== undefined, id).toBe(has('thrown'));
      expect(weapon.ammunition !== undefined, id).toBe(has('ammunition'));
      expect(weapon.ability === 'finesse', id).toBe(has('finesse'));
      if (!weapon.ranged) expect(weapon.normalRangeFt, id).toBe(has('reach') ? 10 : 5);
    }
    expect(WEAPONS.longsword.versatileSides).toBe(10);
    expect(WEAPONS.javelin.thrownRange).toEqual({ normalFt: 30, longFt: 120 });
    expect(WEAPONS['heavy-crossbow']).toMatchObject({ ammunition: 'bolt', longRangeFt: 400 });
    expect(WEAPONS.blowgun).toMatchObject({ flatDamage: 1, ammunition: 'needle' });
  });
});

describe('Weapon Mastery', () => {
  it('counts the kinds a class masters by level, the most any class gives', () => {
    expect(masteryCount([{ classId: 'fighter', level: 1 }])).toBe(3);
    expect(masteryCount([{ classId: 'fighter', level: 10 }])).toBe(5);
    expect(masteryCount([{ classId: 'fighter', level: 16 }])).toBe(6);
    expect(masteryCount([{ classId: 'ranger', level: 7 }])).toBe(2);
    expect(masteryCount([{ classId: 'wizard', level: 20 }])).toBe(0);
    expect(
      masteryCount([
        { classId: 'rogue', level: 3 },
        { classId: 'fighter', level: 4 },
      ]),
    ).toBe(4);
  });

  it('masters the sheet’s first weapons until the sheet names its own', () => {
    const sheet = {
      classes: [{ classId: 'ranger', level: 5 }],
      weapons: ['longbow', 'shortsword', 'dagger'],
    } as const;
    expect(weaponMasteriesOf(sheet)).toEqual(['longbow', 'shortsword']);
    expect(masteryOf(sheet, 'dagger')).toBeNull();
    expect(masteryOf({ ...sheet, weaponMasteries: ['dagger'] }, 'dagger')).toBe('nick');
    expect(masteryOf({ ...sheet, weaponMasteries: ['dagger'] }, 'longbow')).toBeNull();
  });
});
