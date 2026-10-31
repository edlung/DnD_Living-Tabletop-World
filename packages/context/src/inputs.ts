import type { CharacterSheet } from '@ltw/contracts';
import {
  knownEntityIds,
  partyMemberIds,
  perceivedEntityIds,
  scopeKey,
  visibleRecords,
  type EntityState,
  type KnowledgeRecord,
  type MemoryRecord,
  type ResolvedPerspective,
  type WorldState,
} from '@ltw/domain';

/**
 * Everything the Context Engine may use, gathered once per request
 * (docs/adr/0012-context-engine.md). Relevance and topics read only the
 * perspective-visible parts (`records`, `memories`, `known`, `perceived`);
 * canonical data beyond that is used only for whitelisted fields and for
 * the Rules Engine's legality checks on the acting character's own sheet.
 */
export interface ContextInputs {
  readonly state: WorldState;
  readonly perspective: ResolvedPerspective;
  readonly actor: EntityState;
  readonly sheet: CharacterSheet | undefined;
  readonly perceived: ReadonlySet<string>;
  readonly known: ReadonlySet<string>;
  readonly records: readonly KnowledgeRecord[];
  readonly memories: readonly MemoryRecord[];
  /** The acting character plus, if it is in the party, every party member. */
  readonly party: ReadonlySet<string>;
  /** Where the acting character's discoveries go: the party's scope, or its own. */
  readonly scopeKey: string;
  /** What that scope has shown NPCs (`shownKey`): its own actions, never another holder's. */
  readonly shown: ReadonlySet<string>;
}

/** Null when the perspective has no acting character (ADR 0012 "Acting character"). */
export function gatherInputs(
  state: WorldState,
  perspective: ResolvedPerspective,
): ContextInputs | null {
  if (perspective.kind !== 'CHARACTER' || perspective.holderId === null) return null;
  const actor = state.entities.get(perspective.holderId);
  if (actor?.kind !== 'character') return null;
  const members = perspective.partyMemberIds ?? partyMemberIds(state),
    party = members.has(actor.entityId) ? new Set(members) : new Set([actor.entityId]);
  const own = members.has(actor.entityId)
    ? scopeKey({ kind: 'PARTY' })
    : scopeKey({ kind: 'CHARACTER', characterId: actor.entityId });
  return {
    state,
    perspective,
    actor,
    sheet: state.characterSheets.get(actor.entityId),
    perceived: perceivedEntityIds(state, actor.entityId),
    known: knownEntityIds(state, perspective),
    records: visibleRecords(state, perspective),
    memories: [...state.memories.values()].filter(
      (memory) => perspective.scopes === 'ALL' || perspective.scopes.has(scopeKey(memory.scope)),
    ),
    party,
    scopeKey: own,
    shown: new Set([...state.investigation.shown].filter((key) => key.startsWith(`${own}|`))),
  };
}
