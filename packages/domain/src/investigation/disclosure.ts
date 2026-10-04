import type { WorldState } from '../kernel/state.ts';
import type { KnowledgeRecord } from '../knowledge/records.ts';
import { RESERVED_ATTITUDES, attitudeOf } from '../relationships/records.ts';
import type { Premise } from './events.ts';
import { NEVER_SHAREABLE, scopedKey, shownKey } from './records.ts';

/**
 * What an NPC would tell a scope now (docs/adr/0020-npc-intelligence.md §2,
 * owner decision). One rule for `AskAbout`, Insight, and the NPC's dialogue
 * context, so they never disagree. A record already shared with the scope is
 * left out. Otherwise:
 * - WILLING records are shared;
 * - GUARDED records (the default) are shared when their type may ever be
 *   shared, the NPC is neither hostile nor wary, and either the scope has
 *   shown it evidence about one of the record's subjects or it trusts the
 *   party;
 * - everything else is withheld.
 *
 * The premises name what the answer rested on, so undo keeps it exact: every
 * record passed over, whether told before or withheld, and what unlocked a
 * guarded one.
 */
export interface NpcDisclosure {
  readonly shareable: readonly KnowledgeRecord[];
  readonly withheld: readonly KnowledgeRecord[];
  readonly premises: readonly Premise[];
}

export const mentions = (record: KnowledgeRecord, entityId: string) =>
  record.subjects.includes(entityId) || record.attributedTo === entityId;

export function npcDisclosure(
  state: WorldState,
  npcId: string,
  scopeKey: string,
  topicId: string | null,
): NpcDisclosure {
  const attitude = attitudeOf(state, npcId);
  const shareable: KnowledgeRecord[] = [];
  const withheld: KnowledgeRecord[] = [];
  const premises: Premise[] = [];
  let guardedSeen = false;

  for (const record of state.knowledge.values()) {
    if (record.scope.kind !== 'NPC' || record.scope.npcId !== npcId) continue;
    if (topicId !== null && !mentions(record, topicId)) continue;
    const considered: Premise = {
      kind: 'considered',
      scope: scopeKey,
      knowledgeId: record.knowledgeId,
    };
    if (state.investigation.shared.has(scopedKey(scopeKey, record.knowledgeId))) {
      premises.push(considered);
      continue;
    }
    if (state.investigation.disclosures.get(record.knowledgeId) === 'WILLING') {
      shareable.push(record);
      continue;
    }
    if (NEVER_SHAREABLE.has(record.knowledgeType)) {
      withheld.push(record);
      premises.push(considered);
      continue;
    }
    guardedSeen = true;
    const unlocking = RESERVED_ATTITUDES.has(attitude)
      ? undefined
      : attitude === 'TRUSTED'
        ? null
        : record.subjects.find((subjectId) =>
            state.investigation.shown.has(shownKey(scopeKey, npcId, subjectId)),
          );
    if (unlocking === undefined) {
      withheld.push(record);
      premises.push(considered);
      continue;
    }
    shareable.push(record);
    if (unlocking !== null) {
      premises.push({ kind: 'shown', scope: scopeKey, npcId, subjectId: unlocking });
    }
  }
  return {
    shareable,
    withheld,
    premises: guardedSeen ? [{ kind: 'attitude', npcId }, ...premises] : premises,
  };
}
