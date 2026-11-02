import { MAX_COMBATANTS, type KernelCommandOf } from '@ltw/contracts';
import {
  FRESH_TURN,
  accept,
  currentCombatant,
  reject,
  type CombatantRecord,
  type Decision,
  type DecisionContext,
  type WorldState,
} from '@ltw/domain';
import { objectStatBlock } from '@ltw/rules';

import { encounterOf, inBounds, isAlive, occupant } from './battlefield.ts';
import type { Vitals } from './vitals.ts';

/**
 * Objects the party attacks (docs/adr/0048-hit-points.md §5): a door, a chest, a rope at the place,
 * brought into the running fight by the DM. An object takes no turn and rolls no initiative; it
 * fails every save, takes no condition, and is no foe, ally or target of a creature's rules — a
 * weapon's mastery, a grapple, a spell that names creatures. Destroyed at 0 hit points, it stays
 * where it was, broken.
 */
export const isObject = (v: Vitals): boolean =>
  v.kind === 'creature' && v.block.object !== undefined;

export const isObjectIn = (state: WorldState, entityId: string): boolean =>
  state.statBlocks.get(entityId)?.object !== undefined;

/** Below any initiative a creature can have: an object never comes up in the order. */
export const OBJECT_INITIATIVE = { roll: 1, modifier: 0, total: -10 } as const;

const invalid = (message: string) => reject('INVALID_ENCOUNTER', message);

export function decideAddObject(
  context: DecisionContext,
  command: KernelCommandOf<'AddObject'>,
): Decision {
  const { state } = context;
  const found = encounterOf(state);
  if (!found.ok) return found;
  const encounter = found.value;
  const entity = state.entities.get(command.entityId);
  if (!entity || !isAlive(state, command.entityId))
    return invalid('The object must exist and be whole');
  if (entity.kind !== 'item' && entity.kind !== 'feature')
    return invalid('An item or a feature of the place becomes an object');
  if (encounter.combatants.some((c) => c.entityId === command.entityId))
    return invalid('Each combatant may appear once');
  if (entity.placement?.locationId !== encounter.locationId)
    return invalid('Combatants must be at the location');
  if (!inBounds(encounter, command.position))
    return invalid('A combatant stands outside the battlefield');
  if (occupant(state, encounter, command.position, command.entityId))
    return invalid('Two combatants cannot share a square');
  if (encounter.combatants.length >= MAX_COMBATANTS)
    return invalid('The fight holds as many combatants as it can');
  // A thing struck in an earlier fight keeps its damage.
  const earlier = state.statBlocks.get(command.entityId);
  const statBlock = objectStatBlock(
    command.material,
    command.size,
    command.resilient,
    earlier?.object ? earlier.hitPoints.current : undefined,
  );
  const record: CombatantRecord = {
    entityId: command.entityId,
    side: 'neutral',
    position: { ...command.position },
    initiative: { ...OBJECT_INITIATIVE },
    turn: { ...FRESH_TURN },
    slowedBy: null,
  };
  const current = currentCombatant(encounter)?.entityId;
  const combatants = [...encounter.combatants, record];
  return accept(
    { type: 'StatBlockSet', payload: { entityId: command.entityId, statBlock } },
    {
      type: 'CombatOrderChanged',
      payload: {
        change: 'joined',
        entityId: command.entityId,
        combatants,
        currentIndex: combatants.findIndex((c) => c.entityId === current),
      },
    },
  );
}
