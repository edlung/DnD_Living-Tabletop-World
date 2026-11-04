import type { WeaponMastery } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/**
 * The weapon masteries in words (docs/adr/0047-weapons.md §2): English keys the client dictionary
 * translates. The rules are the server's; these words only tell the player what a hit will do.
 */
const NAMES: Readonly<Record<WeaponMastery, string>> = {
  cleave: 'Cleave',
  graze: 'Graze',
  nick: 'Nick',
  push: 'Push',
  sap: 'Sap',
  slow: 'Slow',
  topple: 'Topple',
  vex: 'Vex',
};

const EFFECTS: Readonly<Record<WeaponMastery, string>> = {
  cleave:
    'Cleave: after a hit, one more attack at a creature beside it, without your modifier to damage. Once a turn.',
  graze: 'Graze: a miss still deals your ability modifier as damage.',
  nick: 'Nick: the other hand’s attack comes with the Attack action, not a Bonus Action. Once a turn.',
  push: 'Push: a hit pushes a creature up to 10 ft straight away from you.',
  sap: 'Sap: a creature you hit has Disadvantage on its next attack before your next turn.',
  slow: 'Slow: a hit that deals damage lowers its Speed by 10 ft until your next turn.',
  topple: 'Topple: a hit may knock it Prone unless it succeeds on a Constitution save.',
  vex: 'Vex: a hit that deals damage gives you Advantage on your next attack against it.',
};

export const masteryName = (t: Translate, mastery: WeaponMastery): string => t(NAMES[mastery]);

/** What a mastery does, in one line, for the option's description. */
export const masteryEffect = (t: Translate, mastery: WeaponMastery): string => t(EFFECTS[mastery]);
