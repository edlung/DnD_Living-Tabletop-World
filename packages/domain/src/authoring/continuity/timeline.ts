import type { ResolvedProposable } from '../../kernel/decision.ts';
import type { RecordedEvent } from '../../kernel/events.ts';
import type { WorldState } from '../../kernel/state.ts';
import { isAtOrAfter } from '../../kernel/world-time.ts';
import { mentionedBy } from '../policy.ts';
import {
  ACKNOWLEDGE,
  findingKey,
  nameOf,
  when,
  type ContinuityInput,
  type IssueDraft,
  type WarningDraft,
} from './describe.ts';
import { edit, removal, replaced } from './edits.ts';

/**
 * Time (docs/adr/0018-ai-authoring.md §3, docs/adr/0019-continuity-engine.md §2).
 * Impossible history blocks: knowing something before it existed, or after
 * dying. Implausible history warns: testimony heard from the dead, moving
 * the dead.
 */
type Knowledge = Extract<ResolvedProposable, { type: 'AddKnowledge' }>;

/**
 * The world time at which `entityId` died, if it was dead at `time` under
 * current canon; null if it was alive then. Effective events never go back
 * in world time (ADR 0006 §5), so the last status change at or before `time`
 * decides.
 */
export function deathAt(
  state: WorldState,
  history: readonly RecordedEvent[],
  entityId: string,
  time: number | null,
): number | null {
  if (time === null) return null;
  let death: number | null = null;
  for (const event of history) {
    if (event.type !== 'EntityStatusChanged' || event.payload.entityId !== entityId) continue;
    if ((state.commands.get(event.causation.commandId)?.undoneBy ?? null) !== null) continue;
    if (event.worldTime > time) continue;
    death = event.payload.to === 'dead' ? event.worldTime : null;
  }
  return death;
}

/** Blocking: a record cannot be known before one of its subjects or its speaker existed. */
export function knowledgeBeforeSubject(
  state: WorldState,
  commands: readonly ResolvedProposable[],
  command: Knowledge,
  index: number,
): IssueDraft[] {
  const late = mentionedBy(command).flatMap((id) => {
    const entity = state.entities.get(id);
    return entity && !isAtOrAfter(command.knownSince, entity.existsSince) ? [entity] : [];
  });
  return late.map((entity) => {
    const fixed = edit(
      `Learn it ${when(entity.existsSince)}, once ${entity.name} exists`,
      replaced(commands, index, { ...command, knownSince: entity.existsSince }),
    );
    return {
      key: findingKey('KNOWLEDGE_BEFORE_SUBJECT', index, entity.entityId),
      commandIndex: index,
      code: 'KNOWLEDGE_BEFORE_SUBJECT',
      message: `It would be known ${when(command.knownSince)}, before ${entity.name} existed (${when(entity.existsSince)})`,
      options: [fixed, ...removal(commands, index)],
    };
  });
}

/** Blocking (owner decision): an NPC cannot learn anything after dying. */
export function knownAfterDeath(
  state: WorldState,
  history: readonly RecordedEvent[],
  commands: readonly ResolvedProposable[],
  command: Knowledge,
  index: number,
): IssueDraft[] {
  if (command.scope.kind !== 'NPC') return [];
  const holder = command.scope.npcId;
  const death = deathAt(state, history, holder, command.knownSince);
  if (death === null) return [];
  const name = nameOf(state, holder);
  const before = death - 1;
  const fits = isAtOrAfter(before, state.entities.get(holder)?.existsSince ?? null);
  return [
    {
      key: findingKey('KNOWN_AFTER_DEATH', index, holder),
      commandIndex: index,
      code: 'KNOWN_AFTER_DEATH',
      message: `${name} would learn it ${when(command.knownSince)}, after dying (${when(death)})`,
      options: [
        ...(fits
          ? [
              edit(
                `Learn it just before ${name} died (${when(before)})`,
                replaced(commands, index, { ...command, knownSince: before }),
              ),
            ]
          : []),
        ...removal(commands, index),
      ],
    },
  ];
}

/** Warning: testimony heard from someone already dead at the time. */
export function speakerNotAlive(
  input: ContinuityInput,
  command: ResolvedProposable,
  index: number,
): WarningDraft[] {
  if (command.type !== 'AddKnowledge' || command.knowledgeType !== 'TESTIMONY') return [];
  const speaker = command.attributedTo;
  const holder = command.scope.kind === 'NPC' ? command.scope.npcId : null;
  if (speaker === undefined || speaker === holder) return [];
  const death = deathAt(input.state, input.history, speaker, command.knownSince);
  if (death === null) return [];
  const name = nameOf(input.state, speaker);
  const before = death - 1;
  return [
    {
      key: findingKey('SPEAKER_NOT_ALIVE', index, speaker),
      code: 'SPEAKER_NOT_ALIVE',
      commandIndex: index,
      entityIds: [speaker, ...(holder === null ? [] : [holder])],
      knowledgeIds: [command.knowledgeId],
      message: `${name} died ${when(death)}, before telling this ${when(command.knownSince)}`,
      options: [
        edit(
          `Heard just before ${name} died (${when(before)})`,
          replaced(input.commands, index, { ...command, knownSince: before }),
        ),
        edit(
          'Make it a rumor attributed to them',
          replaced(input.commands, index, { ...command, knowledgeType: 'RUMOR' }),
        ),
        ACKNOWLEDGE,
      ],
    },
  ];
}

/** Warning: moving someone dead. */
export function movesTheDead(
  input: ContinuityInput,
  command: ResolvedProposable,
  index: number,
): WarningDraft[] {
  if (command.type !== 'PlaceEntity') return [];
  if (input.state.entities.get(command.entityId)?.status !== 'dead') return [];
  return [
    {
      key: findingKey('MOVES_THE_DEAD', index, command.entityId),
      code: 'MOVES_THE_DEAD',
      commandIndex: index,
      entityIds: [command.entityId, command.locationId],
      knowledgeIds: [],
      message: `${nameOf(input.state, command.entityId)} is dead; this moves the body to ${nameOf(input.state, command.locationId)}`,
      options: [...removal(input.commands, index), ACKNOWLEDGE],
    },
  ];
}
