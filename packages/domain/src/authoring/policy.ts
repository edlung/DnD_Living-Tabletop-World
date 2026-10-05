import type { KnowledgeType, RiskLevel } from '@ltw/contracts';

import type { ResolvedProposable } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { knownEntityIds } from '../knowledge/projection.ts';
import { languageOf, sayIn, type Say } from '../language/index.ts';

/**
 * What authoring may apply, and at which risk level (owner decisions,
 * docs/adr/0018-ai-authoring.md §2 and §4; claims and relationships since
 * docs/adr/0019-continuity-engine.md). Judged on the state the operation will
 * be decided against.
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
  const say = sayIn(languageOf(state));
  switch (command.type) {
    case 'CreateEntity':
      return command.kind === 'npc'
        ? allowed('L2', say('Adds a new NPC to the world'))
        : refused(
            'L3',
            say('Creating a {kind} is not enabled; only NPCs can be created', {
              kind: command.kind,
            }),
          );
    case 'PlaceEntity':
      return npcOnly(state, command.entityId, allowed('L1', say('Moves an NPC')), say);
    case 'UpdateEntityProfile':
      return npcOnly(
        state,
        command.entityId,
        allowed('L1', say("Edits an NPC's name or description")),
        say,
      );
    case 'AddKnowledge': {
      if (command.scope.kind !== 'NPC') {
        return refused(
          'L3',
          say('Knowledge in the {scope} scope is not enabled; only records an NPC holds', {
            scope: command.scope.kind,
          }),
        );
      }
      if (!NPC_RECORD_TYPES.has(command.knowledgeType)) {
        return refused(
          'L3',
          say('{type} records are not authored', { type: command.knowledgeType }),
        );
      }
      if (command.knowledgeType === 'SECRET') return allowed('L3', say('Gives an NPC a secret'));
      return mentionedBy(command).some((id) => !open.has(id))
        ? allowed('L3', say('Gives an NPC knowledge about a non-public entity'))
        : allowed('L2', say('Gives an NPC knowledge'));
    }
    case 'SetDisclosure': {
      if (command.disclosure === 'GUARDED') {
        return allowed('L1', say('Stops an NPC from sharing a record when asked'));
      }
      const record = state.knowledge.get(command.knowledgeId);
      return record && mentionedBy(record).some((id) => !open.has(id))
        ? allowed('L3', say('Lets an NPC share a record about a non-public entity'))
        : allowed('L2', say('Lets an NPC share a record when asked'));
    }
    case 'SetClaim': {
      if (command.target.kind !== 'knowledge') {
        return refused('L3', say('Claims on clues are not authored'));
      }
      const record = state.knowledge.get(command.target.knowledgeId);
      return record && record.scope.kind !== 'NPC'
        ? refused(
            'L3',
            say('Claims on {scope} records are not authored; only on records an NPC holds', {
              scope: record.scope.kind,
            }),
          )
        : allowed('L2', say('Adds a structured claim to an account'));
    }
    case 'SetRelationship':
      return npcOnly(
        state,
        command.npcId,
        allowed('L2', say('Changes how an NPC feels about the party')),
        say,
      );
    case 'ChangeEntityStatus':
      return refused('L4', say('Deaths and destruction are destructive and cannot be authored'));
    case 'AdvanceWorldTime':
      return refused(
        'L4',
        say('Advancing world time changes the whole world and cannot be authored'),
      );
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
function npcOnly(
  state: WorldState,
  entityId: string,
  policy: OperationPolicy,
  say: Say,
): OperationPolicy {
  const kind = state.entities.get(entityId)?.kind;
  return kind === undefined || kind === 'npc'
    ? policy
    : refused(
        'L3',
        say('Only NPCs can be changed by authoring; "{id}" is a {kind}', { id: entityId, kind }),
      );
}
