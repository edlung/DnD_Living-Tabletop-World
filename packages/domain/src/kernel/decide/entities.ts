import { formatWorldTime, isAtOrAfter } from '../world-time.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../decision.ts';
import type { KernelEvent } from '../events.ts';
import { PLACEABLE_KINDS, STATUSES_BY_KIND, type WorldState } from '../state.ts';
import { isCombatant } from '../../combat/records.ts';
import { findEntity, findUsableLocation } from './lookups.ts';

/**
 * World entity commands (ADR 0006 §3–4, ADR 0007). Existence and placement
 * times may lie in the past (backstory) but never after the world clock.
 */
export function decideCreateEntity(
  state: WorldState,
  command: ResolvedCommandOf<'CreateEntity'>,
): Decision {
  const { entityId, kind, existsSince, location, placement } = command;
  if (state.usedIds.has(entityId)) {
    return reject('ID_ALREADY_USED', `ID "${entityId}" was already used`, { entityId });
  }
  if (existsSince !== null && existsSince > state.clock) {
    return reject('TEMPORAL_CONFLICT', 'An entity cannot begin to exist after the world clock', {
      existsSince,
      clock: state.clock,
    });
  }

  if ((kind === 'location') !== (location !== undefined)) {
    return reject(
      'INVALID_ENTITY_DEFINITION',
      'Location data is required for, and only for, entities of kind "location"',
      { kind },
    );
  }
  if (location && location.parentId !== null) {
    const parent = findUsableLocation(state, location.parentId);
    if (!parent.ok) return parent;
    if (!isAtOrAfter(existsSince, parent.value.existsSince)) {
      return reject('TEMPORAL_CONFLICT', 'A location cannot exist before its parent location', {
        parentId: location.parentId,
      });
    }
  }

  const created: KernelEvent = {
    type: 'EntityCreated',
    payload: {
      entityId,
      kind,
      name: command.name,
      description: command.description ?? '',
      existsSince,
      location: location ?? null,
    },
  };
  if (placement === undefined) return accept(created);

  if (!PLACEABLE_KINDS.has(kind)) {
    return reject('INVALID_PLACEMENT', `Entities of kind "${kind}" cannot be placed`, { kind });
  }
  const target = findUsableLocation(state, placement.locationId);
  if (!target.ok) return target;
  if (
    !isAtOrAfter(placement.since, existsSince) ||
    !isAtOrAfter(placement.since, target.value.existsSince) ||
    (placement.since !== null && placement.since > state.clock)
  ) {
    return reject(
      'TEMPORAL_CONFLICT',
      'Initial placement must begin within the existence of both the entity and the location, and not after the world clock',
      { since: placement.since, clock: state.clock },
    );
  }
  return accept(created, {
    type: 'EntityPlaced',
    payload: {
      entityId,
      locationId: placement.locationId,
      since: placement.since,
      previousLocationId: null,
    },
  });
}

export function decidePlaceEntity(
  state: WorldState,
  command: ResolvedCommandOf<'PlaceEntity'>,
): Decision {
  const found = findEntity(state, command.entityId);
  if (!found.ok) return found;
  const entity = found.value;
  if (!PLACEABLE_KINDS.has(entity.kind)) {
    return reject('INVALID_PLACEMENT', `Entities of kind "${entity.kind}" cannot be placed`, {
      entityId: entity.entityId,
    });
  }
  if (entity.status === 'destroyed') {
    return reject('ENTITY_DESTROYED', `Entity "${entity.entityId}" is destroyed`, {
      entityId: entity.entityId,
    });
  }
  if (isCombatant(state, entity.entityId)) {
    return reject(
      'COMBAT_ALREADY_ACTIVE',
      'A combatant stays on the battlefield until combat ends',
    );
  }
  const target = findUsableLocation(state, command.locationId);
  if (!target.ok) return target;
  if (entity.placement?.locationId === command.locationId) {
    return reject('NO_EFFECT', `Entity "${entity.entityId}" is already there`);
  }
  if (
    !isAtOrAfter(state.clock, entity.existsSince) ||
    !isAtOrAfter(state.clock, target.value.existsSince)
  ) {
    return reject(
      'TEMPORAL_CONFLICT',
      `Cannot place before existence (${formatWorldTime(state.clock)})`,
    );
  }
  return accept({
    type: 'EntityPlaced',
    payload: {
      entityId: entity.entityId,
      locationId: command.locationId,
      since: state.clock,
      previousLocationId: entity.placement?.locationId ?? null,
    },
  });
}

export function decideUpdateEntityProfile(
  state: WorldState,
  command: ResolvedCommandOf<'UpdateEntityProfile'>,
): Decision {
  const found = findEntity(state, command.entityId);
  if (!found.ok) return found;
  const entity = found.value;
  const name =
    command.name !== undefined && command.name !== entity.name
      ? { from: entity.name, to: command.name }
      : undefined;
  const description =
    command.description !== undefined && command.description !== entity.description
      ? { from: entity.description, to: command.description }
      : undefined;
  if (!name && !description) {
    return reject('NO_EFFECT', 'The profile already has these values');
  }
  return accept({
    type: 'EntityProfileUpdated',
    payload: {
      entityId: entity.entityId,
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    },
  });
}

export function decideChangeEntityStatus(
  state: WorldState,
  command: ResolvedCommandOf<'ChangeEntityStatus'>,
): Decision {
  const found = findEntity(state, command.entityId);
  if (!found.ok) return found;
  const entity = found.value;
  if (!STATUSES_BY_KIND[entity.kind].includes(command.status)) {
    return reject(
      'INVALID_STATUS',
      `Status "${command.status}" does not apply to kind "${entity.kind}"`,
      { allowed: STATUSES_BY_KIND[entity.kind] },
    );
  }
  if (entity.status === command.status) {
    return reject('NO_EFFECT', `Entity "${entity.entityId}" is already ${command.status}`);
  }
  return accept({
    type: 'EntityStatusChanged',
    payload: { entityId: entity.entityId, from: entity.status, to: command.status },
  });
}
