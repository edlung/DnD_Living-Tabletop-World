import {
  MAX_TRAP_SQUARES,
  battlefieldSchema,
  paintBattlefield,
  sameGround,
  type KernelCommandOf,
} from '@ltw/contracts';
import { accept, reject, type Decision, type DecisionContext } from '@ltw/domain';

import { fills, trapRules } from '@ltw/rules';

import { encounterOf, inBounds, isAlive, placedOf } from './battlefield.ts';

/**
 * The DM paints a running fight's ground (docs/adr/0057-encounters-maps-loot.md §2): walls,
 * difficult ground, cover, water, heights, obscurement, a trap at a tier it has, harmful ground
 * (§6), or squares cleared. Every square lies on
 * the field; no wall goes up where a creature or an object stands; a stroke that changes nothing,
 * or would lay more terrain than a battlefield holds, is refused. The DM's alone (the kernel's
 * authorization).
 */
const invalid = (message: string) => reject('INVALID_ENCOUNTER', message);

export function decidePaintTerrain(
  context: DecisionContext,
  command: KernelCommandOf<'PaintTerrain'>,
): Decision {
  const { state } = context;
  const found = encounterOf(state);
  if (!found.ok) return found;
  const encounter = found.value;
  if (!command.squares.every((square) => inBounds(encounter, square)))
    return invalid('A square lies outside the battlefield');
  if (
    command.paint.kind === 'wall' &&
    encounter.combatants.some(
      (combatant) =>
        isAlive(state, combatant.entityId) &&
        command.squares.some((square) => fills(placedOf(state, combatant), square)),
    )
  )
    return invalid('A wall cannot rise where someone stands');
  if (command.paint.kind === 'trap') {
    if (command.paint.tier > trapRules(command.paint.trapId).tiers.length)
      return reject('INVALID_COMMAND', 'That trap has no such tier');
    if (
      new Set(command.squares.map(({ x, y }) => `${String(x)},${String(y)}`)).size >
      MAX_TRAP_SQUARES
    )
      return invalid('A trap lies on 64 squares at most');
  }
  const painted = paintBattlefield(encounter.battlefield, command.squares, command.paint);
  if (sameGround(painted, encounter.battlefield))
    return reject('NO_EFFECT', 'The ground is already so');
  if (!battlefieldSchema.safeParse(painted).success)
    return invalid('The battlefield holds no more terrain');
  return accept({
    type: 'TerrainPainted',
    payload: {
      encounterId: encounter.encounterId,
      squares: command.squares.map((square) => ({ x: square.x, y: square.y })),
      paint: command.paint,
    },
  });
}

/**
 * The DM hides squares of a running fight in the fog of war, or reveals them (docs/adr/0057-
 * encounters-maps-loot.md §4). Every square lies on the field; a stroke that changes nothing is
 * refused. What stands under the fog is the DM's to see.
 */
export function decideSetFog(
  context: DecisionContext,
  command: KernelCommandOf<'SetFog'>,
): Decision {
  const found = encounterOf(context.state);
  if (!found.ok) return found;
  const encounter = found.value;
  if (!command.squares.every((square) => inBounds(encounter, square)))
    return invalid('A square lies outside the battlefield');
  const before = new Set(
    (encounter.battlefield.fog ?? []).map(({ x, y }) => `${String(x)},${String(y)}`),
  );
  const changes = command.squares.some(
    ({ x, y }) => before.has(`${String(x)},${String(y)}`) !== command.hidden,
  );
  if (!changes)
    return reject('NO_EFFECT', command.hidden ? 'It is hidden already' : 'It is seen already');
  return accept({
    type: 'FogSet',
    payload: {
      encounterId: encounter.encounterId,
      squares: command.squares.map(({ x, y }) => ({ x, y })),
      hidden: command.hidden,
    },
  });
}
