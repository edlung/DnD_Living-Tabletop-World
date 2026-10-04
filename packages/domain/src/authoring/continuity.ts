import type { AuthoringIssue, AuthoringWarning } from '@ltw/contracts';

import type { ResolvedProposable } from '../kernel/decision.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import { isWithinLocation, placementAt } from '../kernel/projections/world-view.ts';
import type { WorldState } from '../kernel/state.ts';
import { formatWorldTime, isAtOrAfter } from '../kernel/world-time.ts';
import { mentionedBy } from './policy.ts';

/**
 * Continuity checks of authoring (docs/adr/0018-ai-authoring.md §3), on top
 * of each operation's own World Engine rules. Impossible history blocks;
 * the plausibility warnings the owner allowed may be accepted by the DM.
 */
type Knowledge = Extract<ResolvedProposable, { type: 'AddKnowledge' }>;

const when = (time: number | null) =>
  time === null ? 'before recorded history' : formatWorldTime(time);

const nameOf = (state: WorldState, id: string) => state.entities.get(id)?.name ?? id;

/** Blocking: a record cannot be known before one of its subjects or its speaker existed. */
export function knowledgeBeforeSubject(
  state: WorldState,
  command: Knowledge,
  index: number,
): AuthoringIssue[] {
  return mentionedBy(command).flatMap((id) => {
    const entity = state.entities.get(id);
    if (!entity || isAtOrAfter(command.knownSince, entity.existsSince)) return [];
    return [
      {
        commandIndex: index,
        code: 'KNOWLEDGE_BEFORE_SUBJECT',
        message: `It would be known ${when(command.knownSince)}, before ${entity.name} existed (${when(entity.existsSince)})`,
      },
    ];
  });
}

export interface WarningInput {
  /** The provisional state after every applied operation. */
  readonly state: WorldState;
  /** History followed by the provisional events. */
  readonly history: readonly RecordedEvent[];
  readonly commands: readonly ResolvedProposable[];
  /** Indexes of the operations that were decided successfully. */
  readonly applied: ReadonlySet<number>;
  /** Entities that are not secret: public ones and those the proposal created. */
  readonly open: ReadonlySet<string>;
}

export function continuityWarnings(input: WarningInput): AuthoringWarning[] {
  return input.commands.flatMap((command, index) =>
    input.applied.has(index)
      ? [
          ...nameInUse(input.state, command, index),
          ...witnessElsewhere(input, command, index),
          ...secretSubject(input, command, index),
        ]
      : [],
  );
}

const normalized = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** A created or renamed NPC has another entity's name. */
function nameInUse(
  state: WorldState,
  command: ResolvedProposable,
  index: number,
): AuthoringWarning[] {
  const named =
    command.type === 'CreateEntity' ||
    (command.type === 'UpdateEntityProfile' && command.name !== undefined)
      ? { entityId: command.entityId, name: command.name ?? '' }
      : null;
  if (!named) return [];
  const others = [...state.entities.values()].filter(
    (entity) =>
      entity.entityId !== named.entityId && normalized(entity.name) === normalized(named.name),
  );
  if (others.length === 0) return [];
  return [
    {
      key: `NAME_IN_USE@${String(index)}`,
      code: 'NAME_IN_USE',
      commandIndex: index,
      entityIds: [named.entityId, ...others.map((entity) => entity.entityId)],
      message: `"${named.name}" is also the name of ${others.map((entity) => entity.entityId).join(', ')}`,
    },
  ];
}

/**
 * A first-hand record (testimony the holder gave, or evidence) about a
 * place, while the holder was neither there, inside it, nor around it when
 * the record says it became known.
 */
function witnessElsewhere(
  input: WarningInput,
  command: ResolvedProposable,
  index: number,
): AuthoringWarning[] {
  if (command.type !== 'AddKnowledge' || command.scope.kind !== 'NPC') return [];
  const holder = command.scope.npcId;
  const firstHand =
    (command.knowledgeType === 'TESTIMONY' && command.attributedTo === holder) ||
    command.knowledgeType === 'EVIDENCE';
  const places = (command.subjects ?? []).filter(
    (id) => input.state.entities.get(id)?.kind === 'location',
  );
  if (!firstHand || places.length === 0) return [];
  const at = locationAt(input.state, input.history, holder, command.knownSince);
  if (
    at !== null &&
    places.some(
      (place) =>
        isWithinLocation(input.state, at, place) || isWithinLocation(input.state, place, at),
    )
  ) {
    return [];
  }
  const where = at === null ? 'nowhere recorded' : `at ${nameOf(input.state, at)}`;
  return [
    {
      key: `WITNESS_ELSEWHERE@${String(index)}:${holder}`,
      code: 'WITNESS_ELSEWHERE',
      commandIndex: index,
      entityIds: [holder, ...places],
      message: `${nameOf(input.state, holder)} was ${where} ${when(command.knownSince)}, not at ${places.map((id) => nameOf(input.state, id)).join(' or ')}`,
    },
  ];
}

/** An NPC's record about an entity neither the public nor the party knows. */
function secretSubject(
  input: WarningInput,
  command: ResolvedProposable,
  index: number,
): AuthoringWarning[] {
  if (command.type !== 'AddKnowledge' || command.scope.kind !== 'NPC') return [];
  const holder = command.scope.npcId;
  return mentionedBy(command)
    .filter((id) => !input.open.has(id))
    .map((id) => ({
      key: `SECRET_SUBJECT@${String(index)}:${id}`,
      code: 'SECRET_SUBJECT' as const,
      commandIndex: index,
      entityIds: [holder, id],
      message: `${nameOf(input.state, holder)} would know about ${nameOf(input.state, id)}, which neither the public nor the party knows`,
    }));
}

/** Where an entity was at a world time, or before recorded history (`null`), under current canon. */
export function locationAt(
  state: WorldState,
  history: readonly RecordedEvent[],
  entityId: string,
  time: number | null,
): string | null {
  if (time !== null) return placementAt(state, history, entityId, time);
  let location: string | null = null;
  for (const event of history) {
    if (event.type !== 'EntityPlaced' || event.payload.entityId !== entityId) continue;
    if (event.payload.since !== null) continue;
    if ((state.commands.get(event.causation.commandId)?.undoneBy ?? null) !== null) continue;
    location = event.payload.locationId;
  }
  return location;
}
