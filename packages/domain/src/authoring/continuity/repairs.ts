import type { RejectionCode } from '@ltw/contracts';

import type { ResolvedProposable } from '../../kernel/decision.ts';
import type { WorldState } from '../../kernel/state.ts';
import { nameOf, when, type DraftOption } from './describe.ts';
import { edit, replaced } from './edits.ts';

/**
 * Options for an operation the World Engine's own rules refused
 * (docs/adr/0019-continuity-engine.md §1): a fresh entity or record ID for one
 * already used,
 * and times inside the bounds a temporal rule set. Every rejection may also
 * leave the operation out (added by the caller).
 */
export function rejectionOptions(
  state: WorldState,
  commands: readonly ResolvedProposable[],
  index: number,
  code: RejectionCode,
): DraftOption[] {
  const command = commands[index];
  if (!command) return [];
  if (code === 'ID_ALREADY_USED' && command.type === 'CreateEntity') {
    const fresh = freshId(state, commands, command.entityId);
    return [edit(`Use the ID ${fresh}`, renamed(commands, command.entityId, fresh))];
  }
  if (code === 'ID_ALREADY_USED' && command.type === 'AddKnowledge') {
    const fresh = freshId(state, commands, command.knowledgeId);
    return [
      edit(`Use the record ID ${fresh}`, renamedRecord(commands, command.knowledgeId, fresh)),
    ];
  }
  if (code !== 'TEMPORAL_CONFLICT') return [];
  if (command.type === 'CreateEntity') {
    return [
      edit(
        `Let ${command.name} exist since before recorded history`,
        replaced(commands, index, {
          ...command,
          existsSince: null,
          ...(command.placement ? { placement: { ...command.placement, since: null } } : {}),
        }),
      ),
    ];
  }
  if (command.type === 'AddKnowledge') {
    const holder =
      command.scope.kind === 'NPC'
        ? command.scope.npcId
        : command.scope.kind === 'CHARACTER'
          ? command.scope.characterId
          : null;
    const knownSince =
      command.knownSince !== null && command.knownSince > state.clock
        ? state.clock
        : holder === null
          ? null
          : (state.entities.get(holder)?.existsSince ?? null);
    const who = holder === null ? 'the holder' : nameOf(state, holder);
    return [
      edit(
        `Learn it ${when(knownSince)}, while ${who} exists`,
        replaced(commands, index, { ...command, knownSince }),
      ),
    ];
  }
  return [];
}

/** The first `<id>-<n>` neither used in the world nor created by the proposal. */
function freshId(state: WorldState, commands: readonly ResolvedProposable[], id: string): string {
  const taken = new Set(state.usedIds);
  for (const command of commands) {
    if (command.type === 'CreateEntity') taken.add(command.entityId);
    if (command.type === 'AddKnowledge') taken.add(command.knowledgeId);
  }
  for (let n = 2; ; n += 1) {
    const candidate = `${id.slice(0, 60)}-${String(n)}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Every reference to the entity `from`, renamed to `to`. */
function renamed(
  commands: readonly ResolvedProposable[],
  from: string,
  to: string,
): ResolvedProposable[] {
  const swap = (id: string) => (id === from ? to : id);
  return commands.map((command): ResolvedProposable => {
    switch (command.type) {
      case 'CreateEntity':
        return { ...command, entityId: swap(command.entityId) };
      case 'AddKnowledge':
        return {
          ...command,
          scope:
            command.scope.kind === 'NPC'
              ? { ...command.scope, npcId: swap(command.scope.npcId) }
              : command.scope,
          ...(command.subjects ? { subjects: command.subjects.map(swap) } : {}),
          ...(command.attributedTo === undefined
            ? {}
            : { attributedTo: swap(command.attributedTo) }),
        };
      case 'PlaceEntity':
      case 'UpdateEntityProfile':
      case 'ChangeEntityStatus':
        return { ...command, entityId: swap(command.entityId) };
      case 'SetRelationship':
        return { ...command, npcId: swap(command.npcId) };
      case 'SetClaim':
        return {
          ...command,
          claim: { ...command.claim, subjectId: swap(command.claim.subjectId) },
        };
      case 'SetDisclosure':
      case 'AdvanceWorldTime':
        return command;
    }
  });
}

/** The record `from`, and the disclosures and claims that name it, renamed to `to`. */
function renamedRecord(
  commands: readonly ResolvedProposable[],
  from: string,
  to: string,
): ResolvedProposable[] {
  return commands.map((command): ResolvedProposable => {
    if (command.type === 'AddKnowledge' && command.knowledgeId === from) {
      return { ...command, knowledgeId: to };
    }
    if (command.type === 'SetDisclosure' && command.knowledgeId === from) {
      return { ...command, knowledgeId: to };
    }
    if (
      command.type === 'SetClaim' &&
      command.target.kind === 'knowledge' &&
      command.target.knowledgeId === from
    ) {
      return { ...command, target: { kind: 'knowledge', knowledgeId: to } };
    }
    return command;
  });
}
