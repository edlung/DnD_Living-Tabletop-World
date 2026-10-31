import type { EntityState, WorldState } from '../kernel/state.ts';

/**
 * What an acting character perceives right now (docs/adr/0012-context-engine.md
 * "Perception"): entities placed at its current location, that location, its
 * parent location, and its child locations. Perception reads canonical state
 * but yields only entity IDs; views decide which fields of them are shown.
 * Shared by the Context Engine and player-command validation (ADR 0013).
 */
export function perceivedEntityIds(state: WorldState, actingCharacterId: string): Set<string> {
  const here = state.entities.get(actingCharacterId)?.placement?.locationId ?? null;
  const perceived = new Set<string>();
  if (here === null) return perceived;
  const exists = (entity: EntityState) =>
    entity.existsSince === null || entity.existsSince <= state.clock;

  const location = state.entities.get(here);
  if (location && exists(location)) {
    perceived.add(here);
    const parentId = location.location?.parentId ?? null;
    const parent = parentId === null ? undefined : state.entities.get(parentId);
    if (parent && exists(parent)) perceived.add(parent.entityId);
  }
  for (const entity of state.entities.values()) {
    if (!exists(entity)) continue;
    // A carried item is seen only by its carrier (ADR 0039 §9): its old placement says nothing.
    const carrier = state.possessions.get(entity.entityId)?.holderId ?? null;
    if (carrier !== null) {
      if (carrier === actingCharacterId) perceived.add(entity.entityId);
      continue;
    }
    if (entity.placement?.locationId === here) perceived.add(entity.entityId);
    if (entity.kind === 'location' && entity.location?.parentId === here) {
      perceived.add(entity.entityId);
    }
  }
  return perceived;
}
