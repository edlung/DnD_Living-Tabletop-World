import type { Dice, DraftEvent, WorldState } from '@ltw/domain';
import { rollDamage } from '@ltw/rules';

import { applyDamage, type Applied } from '../damage.ts';
import type { AttackSpec } from './attack-windows.ts';

/**
 * A hit's damage (docs/adr/0047-weapons.md; docs/adr/0053-monsters-as-data.md §1): the weapon's
 * dice, the Advantage die, Hunter's Mark, and a stat block's added damage of other types, each
 * applied with its own defenses after the hit's.
 */
/** A hit's damage: the weapon's dice, the Advantage die, Hunter's Mark — doubled on a Critical Hit. */
export function damageOf(dice: Dice, spec: AttackSpec, critical: boolean) {
  const { damage } = spec;
  const parts = [rollDamage(dice, damage.count, damage.sides, damage.bonus, critical)];
  if (spec.advantageDamage && spec.advantage && !spec.disadvantage) {
    const extra = spec.advantageDamage;
    parts.push(rollDamage(dice, extra.count, extra.sides, extra.bonus, critical));
  }
  if (spec.huntersMark) parts.push(rollDamage(dice, 1, 6, 0, critical));
  // A stat block's added damage, each of its own type (docs/adr/0053-monsters-as-data.md §1).
  const extras = (spec.extraDamage ?? []).map((extra) => {
    const rolled = rollDamage(dice, extra.count, extra.sides, extra.bonus, critical);
    return { type: extra.type, amount: rolled.total, rolls: [...rolled.rolls] };
  });
  return {
    amount: parts.reduce((total, part) => total + part.total, 0),
    rolls: parts.flatMap((part) => [...part.rolls]),
    ...(extras.length > 0 ? { extras } : {}),
  };
}

export interface Extra {
  readonly type: string;
  readonly amount: number;
  readonly rolls: readonly number[];
}

/** A hit's added damage of other types (docs/adr/0053-monsters-as-data.md §1), while it lives. */
export function withExtras(
  state: WorldState,
  dice: Dice,
  applied: Applied,
  hit: {
    readonly sourceId: string;
    readonly extras: readonly Extra[];
    readonly halved: boolean;
    readonly critical: boolean;
  },
): Applied {
  let result = applied;
  for (const extra of hit.extras) {
    if (died(result.events)) break;
    const next = applyDamage(state, dice, result.vitals, {
      sourceId: hit.sourceId,
      amount: hit.halved ? Math.floor(extra.amount / 2) : extra.amount,
      damageType: extra.type,
      rolls: extra.rolls,
      critical: hit.critical,
    });
    result = { ...next, events: [...result.events, ...next.events] };
  }
  return result;
}

/** Whether these events record a death. */
export const died = (events: readonly DraftEvent[]) =>
  events.some((event) => event.type === 'EntityStatusChanged' && event.payload.to === 'dead');
