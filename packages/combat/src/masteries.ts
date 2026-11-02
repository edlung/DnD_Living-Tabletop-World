import type { Square } from '@ltw/contracts';
import {
  combatantOf,
  currentCombatant,
  type CombatantRecord,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import { sizeRank, spanOf, squaresOf } from '@ltw/rules';

import type { MadeAttack } from './attack.ts';
import { combatantEvent, coverAt, groundOf, placedOf } from './battlefield.ts';
import { fallEvents } from './falling.ts';
import type { Faller } from './reactions/fall-window.ts';
import type { MasteryUse } from './legality.ts';
import { isObject } from './objects.ts';
import { spellSave } from './saves.ts';
import { fitAt } from './space.ts';
import { has, sizeOf, vitalsEvent, withConditions, type Vitals } from './vitals.ts';

/**
 * The weapon masteries at work (docs/adr/0047-weapons.md §2), after a hit's damage: Sap, Vex,
 * Topple, Push and Cleave's offer. Slow is the slice's and Graze a miss's, in `attack-windows.ts`.
 * Each needs the target still alive; Vex, as Slow, a hit that dealt damage.
 */
export const applied = (
  made: MadeAttack,
  mastery: MasteryUse['kind'],
  move?: { from: Square; to: Square },
) =>
  ({
    type: 'WeaponMasteryApplied',
    payload: {
      attackerId: made.attackerId,
      targetId: made.targetId,
      mastery,
      ...(move ? { from: { ...move.from }, to: { ...move.to } } : {}),
    },
  }) as const;

/**
 * The square a push of `feet` straight away from the pusher ends on: it stops at an edge, a wall,
 * total cover or another creature (docs/adr/0047-weapons.md §2). Away runs from the middle of the
 * pusher's space to the middle of the target's, whatever their sizes
 * (docs/adr/0049-space-and-movement.md §1).
 */
export function pushedTo(
  state: WorldState,
  encounter: EncounterState,
  pusher: CombatantRecord,
  target: CombatantRecord,
  feet: number,
): { readonly square: Square; readonly fallFt: number } {
  const middle = (record: CombatantRecord) => {
    const half = (spanOf(placedOf(state, record)) - 1) / 2;
    return { x: record.position.x + half, y: record.position.y + half };
  };
  const [a, b] = [middle(pusher), middle(target)];
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  let at = target.position;
  const placed = placedOf(state, target);
  for (let step = 0; step < feet / 5; step += 1) {
    const next = { x: at.x + dx, y: at.y + dy };
    const fit = fitAt(state, encounter, target, next, true);
    const space = { ...placed, position: next };
    // It is not pushed up a rise it would climb; pushed off a drop, it falls there and stops
    // (docs/adr/0049-space-and-movement.md §6, §8).
    const drop = groundOf(encounter, { ...placed, position: at }) - groundOf(encounter, space);
    if (
      fit === null ||
      fit.squeezed ||
      drop < -5 ||
      squaresOf(space).some((square) => coverAt(encounter, square) === 'total')
    ) {
      break;
    }
    at = next;
    if (drop > 5) return { square: at, fallFt: drop };
  }
  return { square: at, fallFt: 0 };
}

/**
 * The events of a creature pushed to `to`, falling there when the push sent it off a drop: at once,
 * or — given `falls` — left for the hit's fall moment (docs/adr/0049-space-and-movement.md §8).
 */
export function pushedEvents(
  state: WorldState,
  dice: Dice,
  target: CombatantRecord,
  vitals: Vitals,
  to: { readonly square: Square; readonly fallFt: number },
  falls?: Faller[],
): DraftEvent[] {
  const record = { ...target, position: { ...to.square } };
  const moved = combatantEvent(record);
  if (to.fallFt <= 0) return [moved];
  if (falls) {
    falls.push({ record, vitals, feet: to.fallFt });
    return [moved];
  }
  return [moved, ...fallEvents(state, dice, vitals, to.fallFt).events];
}

/** What a hit's mastery does once its damage is dealt (`amount`, the target alive after it). */
export function masteryOnHit(
  state: WorldState,
  dice: Dice,
  made: MadeAttack,
  mastery: MasteryUse,
  target: Vitals,
  amount: number,
  /** Push's fall, left for the hit's fall moment. */
  falls?: Faller[],
): DraftEvent[] {
  const encounter = state.encounter;
  const record = encounter ? combatantOf(encounter, made.targetId) : undefined;
  const attacker = encounter ? combatantOf(encounter, made.attackerId) : undefined;
  // Every mastery names a creature it hits (SRD 5.2.1): an object takes none of them.
  if (!encounter || !record || !attacker || isObject(target)) return [];
  switch (mastery.kind) {
    case 'sap':
      return [applied(made, 'sap'), combatantEvent({ ...record, sappedBy: made.attackerId })];
    case 'vex': {
      if (amount <= 0) return [];
      // Until the end of its next turn: this one's end too, when it hit on its own turn.
      const own = currentCombatant(encounter)?.entityId === made.attackerId;
      return [
        applied(made, 'vex'),
        combatantEvent({
          ...attacker,
          vexing: { targetId: made.targetId, turnsLeft: own ? 2 : 1 },
        }),
      ];
    }
    case 'topple': {
      if (has(target, 'prone') || mastery.dc === undefined) return [];
      const save = spellSave(dice, target, 'con', mastery.dc, 'none', 'topple');
      if (save.success) return [applied(made, 'topple'), save.event];
      return [
        applied(made, 'topple'),
        save.event,
        {
          type: 'ConditionApplied',
          payload: {
            targetId: made.targetId,
            condition: 'prone',
            applied: true,
            cause: 'topple-mastery',
          },
        },
        vitalsEvent(withConditions(target, ['prone'], [])),
      ];
    }
    case 'push': {
      // A Large or smaller creature (SRD 5.2.1; docs/adr/0049-space-and-movement.md §3).
      if (sizeRank(sizeOf(target)) > sizeRank('large')) return [];
      const to = pushedTo(state, encounter, attacker, record, mastery.pushFt ?? 10);
      if (to.square.x === record.position.x && to.square.y === record.position.y) return [];
      return [
        applied(made, 'push', { from: record.position, to: to.square }),
        ...pushedEvents(state, dice, record, target, to, falls),
      ];
    }
    case 'cleave': {
      // Its second attack is on offer at once, on the attacker's own turn, once a turn.
      const own = currentCombatant(encounter)?.entityId === made.attackerId;
      if (!own || made.by !== undefined || attacker.turn.cleaved === true) return [];
      return [
        combatantEvent({
          ...attacker,
          turn: {
            ...attacker.turn,
            cleave: {
              targetId: made.targetId,
              attackId: made.attackId,
              movementUsedFt: attacker.turn.movementUsedFt,
              attacksRemaining: attacker.turn.attacksRemaining,
            },
          },
        }),
      ];
    }
    default:
      return [];
  }
}
