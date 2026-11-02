import { effectiveMaximum, type ContextEntityRef, type ContextVisibleState } from '@ltw/contracts';

import { distanceTo } from './combat.ts';
import type { ContextInputs } from './inputs.ts';

/**
 * Whitelisted views (docs/adr/0012-context-engine.md "Visible state").
 * Built field by field; canonical objects are never passed through, so a
 * new canonical field cannot leak by accident.
 */
export function entityRefFor(inputs: ContextInputs, entityId: string): ContextEntityRef {
  const entity = inputs.state.entities.get(entityId);
  if (!entity) throw new Error(`entity ${entityId} is missing from canonical state`);
  return {
    entityId: entity.entityId,
    kind: entity.kind,
    name: inputs.known.has(entityId) ? entity.name : null,
  };
}

export function visibleStateFor(inputs: ContextInputs, entityId: string): ContextVisibleState {
  const entity = inputs.state.entities.get(entityId);
  if (!entity) throw new Error(`entity ${entityId} is missing from canonical state`);
  const present = inputs.perceived.has(entityId);
  const sheet = inputs.party.has(entityId) ? inputs.state.characterSheets.get(entityId) : undefined;
  const distanceFt = distanceTo(inputs, entityId);
  return {
    present,
    ...(present ? { status: entity.status } : {}),
    ...(sheet
      ? {
          hitPoints: {
            current: sheet.hitPoints.current,
            max: effectiveMaximum(sheet.hitPoints),
          },
        }
      : {}),
    ...(distanceFt === undefined ? {} : { distanceFt }),
  };
}
