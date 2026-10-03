import type { EntityContextView } from '@ltw/contracts';
import type { ResolvedPerspective, WorldState } from '@ltw/domain';

import { contextActions } from './actions.ts';
import { gatherInputs } from './inputs.ts';
import { entityRefFor, visibleStateFor } from './views.ts';

/**
 * The Context Engine entry point (docs/adr/0012-context-engine.md).
 * `NO_ACTING_CHARACTER`: the perspective has no character to act (DM,
 * PARTY, PUBLIC, NPC). `NOT_FOUND`: the entity is neither perceived nor
 * known, which is indistinguishable from an entity that does not exist.
 */
export type EntityContextResult =
  | {
      readonly ok: true;
      readonly actingCharacterId: string;
      readonly context: EntityContextView;
    }
  | { readonly ok: false; readonly reason: 'NO_ACTING_CHARACTER' | 'NOT_FOUND' };

export function entityContext(
  state: WorldState,
  perspective: ResolvedPerspective,
  entityId: string,
): EntityContextResult {
  const inputs = gatherInputs(state, perspective);
  if (!inputs) return { ok: false, reason: 'NO_ACTING_CHARACTER' };
  const target = state.entities.get(entityId);
  if (!target || !(inputs.perceived.has(entityId) || inputs.known.has(entityId))) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  return {
    ok: true,
    actingCharacterId: inputs.actor.entityId,
    context: {
      entity: entityRefFor(inputs, entityId),
      visibleState: visibleStateFor(inputs, entityId),
      actions: contextActions(inputs, target),
    },
  };
}
