import type { KernelCommandOf } from '@ltw/contracts';
import { accept, reject, type Decision, type DecisionContext } from '@ltw/domain';
import { squaresOf } from '@ltw/rules';

import { encounterOf, fitsOnField, occupant } from './battlefield.ts';
import { FightWork } from './condition-details.ts';
import { carriedRider, riderOf } from './mounts.ts';
import { refused } from './refusal.ts';
import { grapplesSweep } from './unarmed.ts';
import { sizeOf, vitalsOf } from './vitals.ts';

/**
 * The DM's hand on the board (docs/adr/0057-encounters-maps-loot.md §2): a combatant set down on a
 * free square of the field — its whole space clear of walls and of others — at any time, spending
 * no movement and provoking no opportunity attack; a mount carries its rider, and a rider is set
 * down by setting down its mount. Set down out of a grapple's reach, a creature is held no longer,
 * as a shove ends it. The DM's alone (the authorization is the kernel's).
 */
const invalid = (message: string) => reject('INVALID_ENCOUNTER', message);

export function decidePlaceCombatant(
  context: DecisionContext,
  command: KernelCommandOf<'PlaceCombatant'>,
): Decision {
  const { state } = context;
  const found = encounterOf(state);
  if (!found.ok) return found;
  const encounter = found.value;
  const record = encounter.combatants.find((one) => one.entityId === command.combatantId);
  if (!record) return reject('NOT_A_COMBATANT', 'NOT_A_COMBATANT');
  if (record.mountedOn !== undefined) return refused({ legal: false, reason: 'MOUNTED' });
  const { x, y } = command.position;
  if (record.position.x === x && record.position.y === y)
    return reject('NO_EFFECT', 'It stands there already');
  const vitals = vitalsOf(state, record.entityId);
  const space = { position: command.position, size: vitals ? sizeOf(vitals) : 'medium' } as const;
  if (!fitsOnField(encounter, space)) return invalid('A combatant stands outside the battlefield');
  const rider = riderOf(encounter, record.entityId);
  const blocked = squaresOf(space).some((square) => {
    const other = occupant(state, encounter, square, record.entityId);
    return other !== undefined && other.entityId !== rider?.entityId;
  });
  if (blocked) return invalid('Two combatants cannot share a square');
  const placed = { ...record, position: { x, y } };
  // A fresh square: no squeeze carried from the last one.
  delete placed.squeezed;
  const work = new FightWork(state, encounter.combatants);
  const carried = carriedRider(encounter, placed);
  return accept(
    work.record(placed),
    ...(carried ? [work.record(carried)] : []),
    ...grapplesSweep(work, state),
  );
}
