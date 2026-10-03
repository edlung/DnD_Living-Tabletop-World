import { reject, type Decision } from '../decision.ts';
import type { EntityState, WorldState } from '../state.ts';

/** Shared validation lookups. Each returns the record or a ready rejection. */
export type Lookup<T> = { readonly ok: true; readonly value: T } | (Decision & { ok: false });

export function findEntity(state: WorldState, entityId: string): Lookup<EntityState> {
  const entity = state.entities.get(entityId);
  return entity
    ? { ok: true, value: entity }
    : reject('ENTITY_NOT_FOUND', `Entity "${entityId}" does not exist`, { entityId });
}

/** An existing, non-destroyed location that can contain things. */
export function findUsableLocation(state: WorldState, locationId: string): Lookup<EntityState> {
  const found = findEntity(state, locationId);
  if (!found.ok) return found;
  if (found.value.kind !== 'location') {
    return reject('NOT_A_LOCATION', `Entity "${locationId}" is not a location`, { locationId });
  }
  if (found.value.status === 'destroyed') {
    return reject('ENTITY_DESTROYED', `Location "${locationId}" is destroyed`, { locationId });
  }
  return found;
}
