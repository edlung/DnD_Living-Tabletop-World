import {
  accept,
  reject,
  type Decision,
  type DecisionContext,
  type ResolvedCommandOf,
} from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import { investigationText, languageOf } from '../language/index.ts';
import {
  acting,
  incapacitated,
  isIncapacitated,
  knownPremise,
  notFound,
  notPresent,
  premisesEvent,
  target,
} from './acting.ts';
import { mentions } from './disclosure.ts';
import type { Premise } from './events.ts';
import { insightKey, scopedKey } from './records.ts';

/**
 * `InsightCheck` (docs/adr/0020-npc-intelligence.md §4, owner decision): a
 * Wisdom (Insight) check at DC 13 on a present, living NPC about a topic the
 * character knows, once per character and NPC. On success the character's
 * disclosure scope infers that the NPC is holding something back, when it
 * holds a record about the topic that it has not shared with that scope and
 * would not volunteer (GUARDED, SECRET included). A failure and nothing to
 * sense look alike: the check and its dice are recorded, nothing else.
 */
export const INSIGHT_DC = 13;

export function decideInsightCheck(
  context: DecisionContext,
  command: ResolvedCommandOf<'InsightCheck'>,
): Decision {
  const { state } = context;
  const { characterId, npcId, topicId, resolution } = command;
  const actor = acting(state, characterId);
  if (!actor.ok) return actor;
  if (isIncapacitated(actor.value)) return incapacitated();
  const found = target(state, actor.value, npcId);
  if (!found.ok) return found;
  const topicPremise = knownPremise(actor.value, topicId);
  if (topicPremise === null || !state.entities.has(topicId)) return notFound();
  if (!actor.value.perceived.has(npcId)) return notPresent();
  const npc = found.value.entity;
  if (npc.status !== 'active') return reject('TARGET_DEAD', 'Cannot answer');
  if (npc.kind !== 'npc') return reject('NO_EFFECT', 'Nothing to sense');
  const sheet = actor.value.sheet;
  if (!sheet) return reject('NO_CHARACTER_SHEET', 'The character has no sheet');
  if (state.investigation.attempts.has(insightKey(characterId, npcId))) {
    return reject('ALREADY_ATTEMPTED', 'Already attempted');
  }
  if (!context.skillModifier || resolution.d20 === null) {
    throw new Error('InsightCheck resolved without a skill-check port');
  }
  const modifier = context.skillModifier(sheet, 'insight');
  const roll = { d20: resolution.d20, modifier, total: resolution.d20 + modifier };

  const { scopeKey, scope } = actor.value;
  // Every record about the topic, and those it has not shared with this scope: what is held back.
  const about = [...state.knowledge.values()].filter(
    (record) =>
      record.scope.kind === 'NPC' && record.scope.npcId === npcId && mentions(record, topicId),
  );
  const unshared = about.filter(
    (record) => !state.investigation.shared.has(scopedKey(scopeKey, record.knowledgeId)),
  );
  const heldBack = unshared.some(
    (record) =>
      state.investigation.disclosures.get(record.knowledgeId) !== 'WILLING' &&
      record.knowledgeType !== 'UNKNOWN' &&
      record.knowledgeType !== 'CONTRADICTION',
  );
  const inferenceId = roll.total >= INSIGHT_DC && heldBack ? (resolution.ids[0] ?? null) : null;
  if (roll.total >= INSIGHT_DC && heldBack && inferenceId === null) {
    throw new Error('InsightCheck resolved without an ID');
  }
  const topic = state.entities.get(topicId);
  const events: KernelEvent[] = [
    premisesEvent(characterId, [
      { kind: 'sheet' },
      found.value.premise,
      topicPremise,
      ...about.map((record): Premise => ({
        kind: 'considered',
        scope: scopeKey,
        knowledgeId: record.knowledgeId,
      })),
      ...(scope.kind === 'PARTY' ? [{ kind: 'party' } as const] : []),
    ]),
    {
      type: 'InsightChecked',
      payload: { characterId, npcId, topicId, scope: scopeKey, roll, inferenceId },
    },
  ];
  if (inferenceId !== null) {
    events.push({
      type: 'KnowledgeAssigned',
      payload: {
        knowledgeId: inferenceId,
        scope,
        knowledgeType: 'INFERENCE',
        statement: investigationText(languageOf(state)).holdingBack(npc.name, topic?.name ?? null),
        subjects: [npcId, topicId],
        attributedTo: null,
        relations: [],
        knownSince: state.clock,
      },
    });
  }
  return accept(...events);
}
