import type { KnowledgeType, RiskLevel } from '@ltw/contracts';

import type { ResolvedProposable } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { knownEntityIds } from '../knowledge/projection.ts';

/**
 * What authoring may apply, and at which risk level (owner decisions,
 * docs/adr/0018-ai-authoring.md §2 and §4). Judged on the state the
 * operation will be decided against.
 */
export interface OperationPolicy {
  readonly supported: boolean;
  readonly level: RiskLevel;
  readonly reason: string;
}

/** The record types authoring may give an NPC. */
const NPC_RECORD_TYPES: ReadonlySet<KnowledgeType> = new Set([
  'TESTIMONY',
  'RUMOR',
  'FACT',
  'EVIDENCE',
  'SECRET',
]);

/** Entities that are not secret: known to the PUBLIC perspective, or members of the party. */
export function publicEntityIds(state: WorldState): Set<string> {
  const ids = knownEntityIds(state, holderPerspective(state, { kind: 'PUBLIC' }));
  for (const characterId of state.roster.keys()) ids.add(characterId);
  return ids;
}

/** The entities a record is about or attributed to. */
export function mentionedBy(record: {
  readonly subjects?: readonly string[] | undefined;
  readonly attributedTo?: string | null | undefined;
}): string[] {
  const attributed = record.attributedTo ?? null;
  return [...new Set([...(record.subjects ?? []), ...(attributed === null ? [] : [attributed])])];
}

/** `open` holds the entities that are not secret: public ones and those the proposal created. */
export function operationPolicy(
  state: WorldState,
  command: ResolvedProposable,
  open: ReadonlySet<string>,
): OperationPolicy {
  switch (command.type) {
    case 'CreateEntity':
      return command.kind === 'npc'
        ? allowed('L2', 'Adds a new NPC to the world')
        : refused('L3', `Creating a ${command.kind} is not enabled; only NPCs can be created`);
    case 'PlaceEntity':
      return npcOnly(state, command.entityId, allowed('L1', 'Moves an NPC'));
    case 'UpdateEntityProfile':
      return npcOnly(state, command.entityId, allowed('L1', "Edits an NPC's name or description"));
    case 'AddKnowledge': {
      if (command.scope.kind !== 'NPC') {
        return refused(
          'L3',
          `Knowledge in the ${command.scope.kind} scope is not enabled; only records an NPC holds`,
        );
      }
      if (!NPC_RECORD_TYPES.has(command.knowledgeType)) {
        return refused('L3', `${command.knowledgeType} records are not authored`);
      }
      if (command.knowledgeType === 'SECRET') return allowed('L3', 'Gives an NPC a secret');
      return mentionedBy(command).some((id) => !open.has(id))
        ? allowed('L3', 'Gives an NPC knowledge about a non-public entity')
        : allowed('L2', 'Gives an NPC knowledge');
    }
    case 'SetDisclosure': {
      if (command.disclosure === 'GUARDED') {
        return allowed('L1', 'Stops an NPC from sharing a record when asked');
      }
      const record = state.knowledge.get(command.knowledgeId);
      return record && mentionedBy(record).some((id) => !open.has(id))
        ? allowed('L3', 'Lets an NPC share a record about a non-public entity')
        : allowed('L2', 'Lets an NPC share a record when asked');
    }
    case 'ChangeEntityStatus':
      return refused('L4', 'Deaths and destruction are destructive and cannot be authored');
    case 'AdvanceWorldTime':
      return refused('L4', 'Advancing world time changes the whole world and cannot be authored');
  }
}

const allowed = (level: RiskLevel, reason: string): OperationPolicy => ({
  supported: true,
  level,
  reason,
});
const refused = (level: RiskLevel, reason: string): OperationPolicy => ({
  supported: false,
  level,
  reason,
});

/** Edits apply to NPCs only. An unknown target is left to the World Engine's own rejection. */
function npcOnly(state: WorldState, entityId: string, policy: OperationPolicy): OperationPolicy {
  const kind = state.entities.get(entityId)?.kind;
  return kind === undefined || kind === 'npc'
    ? policy
    : refused('L3', `Only NPCs can be changed by authoring; "${entityId}" is a ${kind}`);
}
