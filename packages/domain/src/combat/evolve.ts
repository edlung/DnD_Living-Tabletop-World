import { fogBattlefield, paintBattlefield } from '@ltw/contracts';

import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import type { RecordedEvent, Restore } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import { namedEntityIds } from './named-entities.ts';
import { openReactionWindow } from './reactions.ts';
import { encounterAfterTurnStart, type EncounterState } from './records.ts';

/** Fold cases for combat events (called from kernel/evolve.ts). */
type EventOf<T extends RecordedEvent['type']> = Extract<RecordedEvent, { type: T }>;

function requireEncounter(state: WorldState, what: string): EncounterState {
  if (!state.encounter) throw new CorruptHistoryError(`${what} without an encounter`);
  return state.encounter;
}

export function applyCombatStarted(state: WorldState, event: EventOf<'CombatStarted'>): WorldState {
  if (state.encounter) throw new CorruptHistoryError('combat started twice');
  const encounter = event.payload;
  if (!encounter.combatants.every((c) => state.entities.has(c.entityId))) {
    throw new CorruptHistoryError('combat with a missing combatant');
  }
  return {
    ...state,
    encounter: structuredClone(encounter),
    usedIds: new Set(state.usedIds).add(encounter.encounterId),
  };
}

export function applyTurnStarted(state: WorldState, event: EventOf<'TurnStarted'>): WorldState {
  const encounter = requireEncounter(state, 'turn');
  const next = encounterAfterTurnStart(encounter, event.payload.combatantId, event.payload.round);
  if (!next) throw new CorruptHistoryError('turn of a non-combatant');
  return { ...state, encounter: next };
}

export function applyCombatantUpdated(
  state: WorldState,
  event: EventOf<'CombatantUpdated'>,
): WorldState {
  const encounter = requireEncounter(state, 'combatant update');
  const { combatant } = event.payload;
  if (!encounter.combatants.some((c) => c.entityId === combatant.entityId)) {
    throw new CorruptHistoryError('update of a non-combatant');
  }
  return {
    ...state,
    encounter: {
      ...encounter,
      combatants: encounter.combatants.map((c) =>
        c.entityId === combatant.entityId ? structuredClone(combatant) : c,
      ),
    },
  };
}

/** The DM's change of a running fight (ADR 0043 §2): the whole new order and the turn's place. */
/** The fight's light (docs/adr/0050-the-world-around.md §1). */
export function applyLightSet(state: WorldState, event: EventOf<'LightSet'>): WorldState {
  const encounter = requireEncounter(state, 'light');
  if (encounter.encounterId !== event.payload.encounterId) {
    throw new CorruptHistoryError('light for another fight');
  }
  return {
    ...state,
    encounter: {
      ...encounter,
      battlefield: { ...encounter.battlefield, ambient: event.payload.ambient },
    },
  };
}

/** The fight's light, ground and fog as the DM sets them (ADR 0050 §1; ADR 0057 §2, §4). */
export function applyBattlefieldEvent(
  state: WorldState,
  event: EventOf<'LightSet' | 'TerrainPainted' | 'FogSet'>,
): WorldState {
  if (event.type === 'LightSet') return applyLightSet(state, event);
  if (event.type === 'TerrainPainted') return applyTerrainPainted(state, event);
  // The fog of war laid or lifted (docs/adr/0057-encounters-maps-loot.md §4).
  const encounter = requireEncounter(state, 'fog');
  if (encounter.encounterId !== event.payload.encounterId) {
    throw new CorruptHistoryError('fog for another fight');
  }
  const { squares, hidden } = event.payload;
  return {
    ...state,
    encounter: {
      ...encounter,
      battlefield: fogBattlefield(encounter.battlefield, squares, hidden),
    },
  };
}

/** The DM's brush on the fight's ground (docs/adr/0057-encounters-maps-loot.md §2). */
export function applyTerrainPainted(
  state: WorldState,
  event: EventOf<'TerrainPainted'>,
): WorldState {
  const encounter = requireEncounter(state, 'terrain');
  if (encounter.encounterId !== event.payload.encounterId) {
    throw new CorruptHistoryError('terrain for another fight');
  }
  const { squares, paint } = event.payload;
  return {
    ...state,
    encounter: {
      ...encounter,
      battlefield: paintBattlefield(encounter.battlefield, squares, paint),
    },
  };
}

export function applyCombatOrderChanged(
  state: WorldState,
  event: EventOf<'CombatOrderChanged'>,
): WorldState {
  const encounter = requireEncounter(state, 'order change');
  const { combatants, currentIndex } = event.payload;
  if (!combatants.every((c) => state.entities.has(c.entityId))) {
    throw new CorruptHistoryError('order with a missing combatant');
  }
  if (new Set(combatants.map((c) => c.entityId)).size !== combatants.length) {
    throw new CorruptHistoryError('a combatant twice in the order');
  }
  if (currentIndex >= combatants.length) throw new CorruptHistoryError('turn outside the order');
  return {
    ...state,
    encounter: { ...encounter, combatants: structuredClone(combatants), currentIndex },
  };
}

export function applyCombatEnded(state: WorldState, event: EventOf<'CombatEnded'>): WorldState {
  const encounter = requireEncounter(state, 'combat end');
  if (encounter.encounterId !== event.payload.encounterId) {
    throw new CorruptHistoryError('ending another encounter');
  }
  if (openReactionWindow(state)) throw new CorruptHistoryError('combat ended with a window open');
  return { ...state, encounter: null };
}

export function applyStatBlockSet(state: WorldState, event: EventOf<'StatBlockSet'>): WorldState {
  if (!state.entities.has(event.payload.entityId)) {
    throw new CorruptHistoryError('stat block for a missing entity');
  }
  return {
    ...state,
    statBlocks: withEntry(
      state.statBlocks,
      event.payload.entityId,
      structuredClone(event.payload.statBlock),
    ),
  };
}

/** Narrative combat events change no state; they must reference existing entities. */
export function applyCombatRecord(state: WorldState, event: RecordedEvent): WorldState {
  if (namedEntityIds(event.payload).some((id) => !state.entities.has(id))) {
    throw new CorruptHistoryError(`${event.type} references a missing entity`);
  }
  return state;
}

type CombatRestore = Extract<Restore, { fact: 'encounter' | 'statblock' }>;

export function applyCombatRestore(state: WorldState, restore: CombatRestore): WorldState {
  if (restore.fact === 'encounter') {
    return { ...state, encounter: restore.value === null ? null : structuredClone(restore.value) };
  }
  return {
    ...state,
    statBlocks:
      restore.value === null
        ? withoutEntry(state.statBlocks, restore.entityId)
        : withEntry(state.statBlocks, restore.entityId, structuredClone(restore.value)),
  };
}
