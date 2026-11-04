import type { Ability } from '@ltw/contracts';
import { evasion } from '@ltw/rules';

import { incapacitated, type Vitals } from './vitals.ts';

/**
 * The damage a save for half leaves (SRD 5.2.1): all on a failure, half or none on a success; with
 * Evasion (a Rogue's or a Monk's from 7, able to act), a Dexterity save for half takes none on a
 * success and half on a failure (docs/adr/0056-characters-from-the-srd.md §4).
 */
export function savedDamage(
  target: Vitals,
  ability: Ability,
  onSuccess: 'half' | 'none',
  saved: boolean,
  total: number,
): number {
  const evades =
    onSuccess === 'half' &&
    ability === 'dex' &&
    target.kind === 'character' &&
    evasion(target.sheet) &&
    !incapacitated(target);
  if (evades) return saved ? 0 : Math.floor(total / 2);
  if (!saved) return total;
  return onSuccess === 'half' ? Math.floor(total / 2) : 0;
}
