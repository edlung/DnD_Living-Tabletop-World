import type { WeaponId } from '@ltw/contracts';

import { WEAPONS } from './weapons.ts';

/**
 * Weapon Mastery (SRD 5.2.1; docs/adr/0047-weapons.md §2): how many kinds of weapon a class lets a
 * character master, by level, and which kinds a character's attacks use the mastery of.
 */
const MASTERY_COUNTS: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  barbarian: [
    [1, 2],
    [4, 3],
    [10, 4],
  ],
  fighter: [
    [1, 3],
    [4, 4],
    [10, 5],
    [16, 6],
  ],
  paladin: [[1, 2]],
  ranger: [[1, 2]],
  rogue: [[1, 2]],
};

/** The parts of a sheet Weapon Mastery reads. */
interface MasterySheet {
  readonly classes: readonly { readonly classId: string; readonly level: number }[];
  readonly weapons: readonly WeaponId[];
  readonly weaponMasteries?: readonly WeaponId[] | undefined;
}

/** The kinds of weapon a character's classes let it master: the most any one class gives. */
export function masteryCount(classes: MasterySheet['classes']): number {
  let count = 0;
  for (const entry of classes) {
    for (const [level, kinds] of MASTERY_COUNTS[entry.classId] ?? []) {
      if (entry.level >= level) count = Math.max(count, kinds);
    }
  }
  return count;
}

/**
 * The kinds of weapon whose mastery a character uses: the sheet's choice, or — until Stage 660's
 * choices — as many of its sheet's weapons, in order, as its classes allow.
 */
export function weaponMasteriesOf(sheet: MasterySheet): readonly WeaponId[] {
  return sheet.weaponMasteries ?? sheet.weapons.slice(0, masteryCount(sheet.classes));
}

/** The mastery a character's attack with this weapon uses, or null when it has not mastered it. */
export const masteryOf = (sheet: MasterySheet, weaponId: WeaponId) =>
  weaponMasteriesOf(sheet).includes(weaponId) ? WEAPONS[weaponId].mastery : null;
