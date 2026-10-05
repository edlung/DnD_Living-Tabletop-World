import type { SurroundingsResponse } from '@ltw/contracts';
import type { ResolvedPerspective, WorldState } from '@ltw/domain';

import { gatherInputs } from './inputs.ts';
import { entityRefFor } from './views.ts';

/**
 * Enumerate the locations the acting character already perceives (ADR 0012).
 * Discovery adds no knowledge: names remain null until the perspective knows them.
 * No canonical scene, absent entity placement, or hidden location is returned.
 */
export function surroundings(
  state: WorldState,
  perspective: ResolvedPerspective,
): SurroundingsResponse | null {
  const inputs = gatherInputs(state, perspective);
  if (!inputs) return null;
  const currentId = inputs.actor.placement?.locationId ?? null;
  const location =
    currentId !== null && inputs.perceived.has(currentId) ? entityRefFor(inputs, currentId) : null;
  const nearby = [...inputs.perceived]
    .filter((id) => id !== currentId && state.entities.get(id)?.kind === 'location')
    .sort()
    .map((id) => entityRefFor(inputs, id));
  return {
    perspective: perspective.label,
    actingCharacterId: inputs.actor.entityId,
    location,
    nearby,
  };
}
