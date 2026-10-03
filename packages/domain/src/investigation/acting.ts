import type { CharacterSheet, KnowledgeScope, MemoryKind } from '@ltw/contracts';

import type { Lookup } from '../kernel/decide/lookups.ts';
import { reject, type Decision } from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import type { EntityState, WorldState } from '../kernel/state.ts';
import { holderPerspective, type ResolvedPerspective } from '../knowledge/perspective.ts';
import { knownEntityIds } from '../knowledge/projection.ts';
import { scopeKey } from '../knowledge/records.ts';
import { DEFAULT_SALIENCE } from '../memory/records.ts';
import { perceivedEntityIds } from './perception.ts';

/**
 * Shared preconditions of player commands (docs/adr/0013-investigation.md §1).
 * Order protects secrets: the actor's own state, then selectability
 * (perceived or known; otherwise "not found", identical to a nonexistent
 * ID), then presence, then the target's status. Messages are fixed strings
 * without details, so a rejection never carries more than its code.
 */
export interface Acting {
  readonly character: EntityState;
  readonly sheet: CharacterSheet | undefined;
  readonly perspective: ResolvedPerspective;
  /** Where discoveries and shared records go: the party, or the character alone. */
  readonly scope: Extract<KnowledgeScope, { kind: 'PARTY' | 'CHARACTER' }>;
  readonly scopeKey: string;
  readonly perceived: ReadonlySet<string>;
  readonly known: ReadonlySet<string>;
  readonly locationId: string | null;
}

export const notFound = (): Decision & { ok: false } => reject('ENTITY_NOT_FOUND', 'Not found');

export function acting(state: WorldState, characterId: string): Lookup<Acting> {
  const character = state.entities.get(characterId);
  if (character?.kind !== 'character') return notFound();
  if (character.status !== 'active') return reject('ACTOR_DEAD', 'The character is dead');
  const perspective = holderPerspective(state, { kind: 'CHARACTER', characterId });
  const scope: Acting['scope'] = state.roster.has(characterId)
    ? { kind: 'PARTY' }
    : { kind: 'CHARACTER', characterId };
  return {
    ok: true,
    value: {
      character,
      sheet: state.characterSheets.get(characterId),
      perspective,
      scope,
      scopeKey: scopeKey(scope),
      perceived: perceivedEntityIds(state, characterId),
      known: knownEntityIds(state, perspective),
      locationId: character.placement?.locationId ?? null,
    },
  };
}

export const isIncapacitated = (actor: Acting) =>
  actor.sheet?.conditions.includes('incapacitated') ?? false;

export const incapacitated = () => reject('ACTOR_INCAPACITATED', 'The character is incapacitated');

/** A selectable target, or "not found" for anything else. */
export function target(state: WorldState, actor: Acting, entityId: string): Lookup<EntityState> {
  const entity = state.entities.get(entityId);
  if (!entity || !(actor.perceived.has(entityId) || actor.known.has(entityId))) return notFound();
  return { ok: true, value: entity };
}

export const notPresent = () => reject('NOT_PRESENT', 'Not here');

/** One memory of the acting character's scope about something that just happened. */
export function memoryEvent(
  state: WorldState,
  actor: Acting,
  memory: {
    readonly memoryId: string;
    readonly memoryKind: MemoryKind;
    readonly summary: string;
    readonly participants: readonly string[];
    readonly relatedKnowledge: readonly string[];
  },
): KernelEvent {
  return {
    type: 'MemoryRecorded',
    payload: {
      memoryId: memory.memoryId,
      scope: actor.scope,
      memoryKind: memory.memoryKind,
      summary: memory.summary.slice(0, 2000),
      occurredAt: state.clock,
      locationId: actor.locationId,
      participants: [...new Set(memory.participants)],
      sessionId: state.activeSessionId,
      relatedKnowledge: [...memory.relatedKnowledge],
      causedBy: [],
      salience: DEFAULT_SALIENCE,
      witnesses: [actor.character.entityId],
    },
  };
}
