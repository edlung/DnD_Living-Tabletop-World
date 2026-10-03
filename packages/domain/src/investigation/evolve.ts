import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import type { RecordedEvent, Restore } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import { attemptKey, scopedKey, type InvestigationState } from './records.ts';

/** Fold cases for investigation events (called from kernel/evolve.ts). */
type EventOf<T extends RecordedEvent['type']> = Extract<RecordedEvent, { type: T }>;

const withInvestigation = (state: WorldState, change: Partial<InvestigationState>): WorldState => ({
  ...state,
  investigation: { ...state.investigation, ...change },
});

const added = (set: ReadonlySet<string>, ...keys: string[]) => {
  const next = new Set(set);
  keys.forEach((key) => next.add(key));
  return next;
};

const removed = (set: ReadonlySet<string>, key: string) => {
  const next = new Set(set);
  next.delete(key);
  return next;
};

export function applyClueAdded(state: WorldState, event: EventOf<'ClueAdded'>): WorldState {
  const clue = event.payload;
  if (state.usedIds.has(clue.clueId)) throw new CorruptHistoryError(`id ${clue.clueId} reused`);
  if (![clue.entityId, ...clue.subjects].every((id) => state.entities.has(id))) {
    throw new CorruptHistoryError(`clue ${clue.clueId} references a missing entity`);
  }
  return {
    ...withInvestigation(state, {
      clues: withEntry(state.investigation.clues, clue.clueId, { ...clue }),
    }),
    usedIds: new Set(state.usedIds).add(clue.clueId),
  };
}

export function applyDisclosureSet(state: WorldState, event: EventOf<'DisclosureSet'>): WorldState {
  const { knowledgeId, disclosure } = event.payload;
  if (state.knowledge.get(knowledgeId)?.scope.kind !== 'NPC') {
    throw new CorruptHistoryError(`disclosure for non-NPC record ${knowledgeId}`);
  }
  return withInvestigation(state, {
    disclosures: withEntry(state.investigation.disclosures, knowledgeId, disclosure),
  });
}

export function applyEvidenceExamined(
  state: WorldState,
  event: EventOf<'EvidenceExamined'>,
): WorldState {
  const { characterId, entityId, method, scope, roll, revealed } = event.payload;
  const { investigation } = state;
  const attempt = attemptKey(characterId, entityId, method);
  if (roll !== null && investigation.attempts.has(attempt)) {
    throw new CorruptHistoryError(`repeated attempt ${attempt}`);
  }
  const keys = revealed.map(({ clueId }) => {
    if (!investigation.clues.has(clueId)) throw new CorruptHistoryError(`missing clue ${clueId}`);
    return scopedKey(scope, clueId);
  });
  if (keys.some((key) => investigation.revealed.has(key))) {
    throw new CorruptHistoryError(`clue revealed twice to ${scope}`);
  }
  return withInvestigation(state, {
    attempts: roll === null ? investigation.attempts : added(investigation.attempts, attempt),
    revealed: added(investigation.revealed, ...keys),
  });
}

export function applyInformationShared(
  state: WorldState,
  event: EventOf<'InformationShared'>,
): WorldState {
  const { scope, sourceKnowledgeId, knowledgeId } = event.payload;
  const key = scopedKey(scope, sourceKnowledgeId);
  if (!state.knowledge.has(sourceKnowledgeId) || !state.knowledge.has(knowledgeId)) {
    throw new CorruptHistoryError(`sharing references a missing record`);
  }
  if (state.investigation.shared.has(key)) throw new CorruptHistoryError(`shared twice: ${key}`);
  return withInvestigation(state, { shared: added(state.investigation.shared, key) });
}

/** Premises change no state; they must reference what existed when recorded. */
export function applyPremisesRecorded(
  state: WorldState,
  event: EventOf<'PremisesRecorded'>,
): WorldState {
  const { characterId, premises } = event.payload;
  const exists = premises.every((premise) => {
    switch (premise.kind) {
      case 'perceived':
        return state.entities.has(premise.entityId);
      case 'party-member':
        return state.roster.has(premise.characterId);
      case 'knowledge':
        return state.knowledge.has(premise.knowledgeId);
      case 'memory':
        return state.memories.has(premise.memoryId);
      case 'controller':
        return state.roster.get(characterId) === premise.playerActorId;
      default:
        return true;
    }
  });
  if (!state.entities.has(characterId) || !exists) {
    throw new CorruptHistoryError(`premises of ${characterId} reference something missing`);
  }
  return state;
}

type InvestigationRestore = Extract<
  Restore,
  { fact: 'clue' | 'disclosure' | 'attempt' | 'revealed' | 'shared' }
>;

export function applyInvestigationRestore(
  state: WorldState,
  restore: InvestigationRestore,
): WorldState {
  const { investigation } = state;
  switch (restore.fact) {
    case 'clue':
      return withInvestigation(state, { clues: withoutEntry(investigation.clues, restore.clueId) });
    case 'disclosure':
      return withInvestigation(state, {
        disclosures:
          restore.value === null
            ? withoutEntry(investigation.disclosures, restore.knowledgeId)
            : withEntry(investigation.disclosures, restore.knowledgeId, restore.value),
      });
    case 'attempt':
      return withInvestigation(state, { attempts: removed(investigation.attempts, restore.key) });
    case 'revealed':
      return withInvestigation(state, { revealed: removed(investigation.revealed, restore.key) });
    case 'shared':
      return withInvestigation(state, { shared: removed(investigation.shared, restore.key) });
  }
}
