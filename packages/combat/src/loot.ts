import {
  carriedBy,
  possessionOf,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';

/**
 * What the fallen carried (docs/adr/0057-encounters-maps-loot.md §7): as a fight ends, the things
 * each creature or NPC that fell in it carried, unworn, lie where the fight was — the place's items
 * now, for the party to take as anything lying there. Nothing moves while the fight runs.
 */
export function fallenBelongings(state: WorldState, encounter: EncounterState): DraftEvent[] {
  const events: DraftEvent[] = [];
  for (const combatant of encounter.combatants) {
    const entity = state.entities.get(combatant.entityId);
    if (entity?.status !== 'dead' || (entity.kind !== 'creature' && entity.kind !== 'npc'))
      continue;
    for (const itemId of carriedBy(state, combatant.entityId)) {
      const possession = possessionOf(state, itemId);
      if (!possession || possession.slot !== null) continue;
      events.push(
        {
          type: 'ItemTransferred',
          payload: {
            itemId,
            from: combatant.entityId,
            to: null,
            catalogId: possession.catalogId,
            quantity: possession.quantity,
          },
        },
        {
          type: 'EntityPlaced',
          payload: {
            entityId: itemId,
            locationId: encounter.locationId,
            since: state.clock,
            previousLocationId: state.entities.get(itemId)?.placement?.locationId ?? null,
          },
        },
      );
    }
  }
  return events;
}
