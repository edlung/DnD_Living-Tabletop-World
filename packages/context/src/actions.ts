import type { ContextAction, ContextActionId, Relevance } from '@ltw/contracts';
import type { EntityState } from '@ltw/domain';

import type { ContextInputs } from './inputs.ts';
import {
  LEGAL,
  capableVerdict,
  illegalBecause,
  longbowVerdict,
  spellVerdict,
  type Verdict,
} from './legality.ts';
import { RELEVANCE_RANK, memoriesAbout } from './relevance.ts';
import { askTopics } from './topics.ts';

/**
 * The slice action catalog (docs/adr/0012-context-engine.md "Actions").
 * Actions are descriptors; executing them belongs to later stages.
 *
 * Check order protects secrets: the actor's own state first, then
 * presence, and only for present targets their status. An absent target
 * is always `NOT_PRESENT`, so its status cannot be inferred from reasons.
 */
type Requirement = 'none' | 'present' | 'present-alive';

interface Candidate {
  readonly id: ContextActionId;
  readonly requires: Requirement;
  readonly verdict: () => Verdict;
  readonly relevance: Relevance;
}

const CREATURE_KINDS: ReadonlySet<EntityState['kind']> = new Set(['character', 'npc', 'creature']);
const OBJECT_KINDS: ReadonlySet<EntityState['kind']> = new Set(['item', 'feature']);

export function contextActions(inputs: ContextInputs, target: EntityState): ContextAction[] {
  const present = inputs.perceived.has(target.entityId);
  const alive = target.status === 'active';
  const self = target.entityId === inputs.actor.entityId;
  const { sheet } = inputs;
  const examine: Relevance = present && OBJECT_KINDS.has(target.kind) ? 'medium' : 'low';

  const candidates: Candidate[] = [];
  const add = (
    id: ContextActionId,
    requires: Requirement,
    verdict: () => Verdict,
    relevance: Relevance,
  ) => candidates.push({ id, requires, verdict, relevance });

  if (CREATURE_KINDS.has(target.kind)) {
    if (!self) {
      const talk: Relevance = present && alive && target.kind === 'npc' ? 'medium' : 'low';
      add('talk', 'present-alive', () => capableVerdict(sheet), talk);
      if (target.kind === 'npc') add('trade', 'present-alive', () => capableVerdict(sheet), 'low');
    }
    add('inspect', 'present', () => LEGAL, 'low');
    if (!self) add('insight_check', 'present-alive', () => capableVerdict(sheet), 'low');
    const wounded = (() => {
      const hp = inputs.party.has(target.entityId)
        ? inputs.state.characterSheets.get(target.entityId)?.hitPoints
        : undefined;
      return hp !== undefined && hp.current < hp.max;
    })();
    add(
      'healing_word',
      'present-alive',
      () => spellVerdict(sheet, 'healing-word'),
      present && alive && wounded ? 'high' : 'low',
    );
    if (!self) {
      add('hunters_mark', 'present-alive', () => spellVerdict(sheet, 'hunters-mark'), 'low');
      add('longbow_attack', 'present-alive', () => longbowVerdict(sheet), 'low');
    }
  } else if (OBJECT_KINDS.has(target.kind)) {
    add('inspect', 'present', () => LEGAL, examine);
    add('investigation_check', 'present', () => capableVerdict(sheet), examine);
    add('perception_check', 'present', () => capableVerdict(sheet), examine);
    add('detect_magic', 'present', () => spellVerdict(sheet, 'detect-magic'), 'low');
  } else if (target.kind === 'location') {
    add('inspect', 'present', () => LEGAL, 'low');
  }
  if (memoriesAbout(inputs, target.entityId) > 0) add('recall', 'none', () => LEGAL, 'high');

  const judge = (requires: Requirement, verdict: () => Verdict): Verdict => {
    if (inputs.actor.status !== 'active') return illegalBecause('ACTOR_DEAD');
    if (requires !== 'none' && !present) return illegalBecause('NOT_PRESENT');
    if (requires === 'present-alive' && !alive) return illegalBecause('TARGET_DEAD');
    return verdict();
  };

  const actions: ContextAction[] = candidates.map((candidate) =>
    toAction(candidate.id, judge(candidate.requires, candidate.verdict), candidate.relevance),
  );
  if (CREATURE_KINDS.has(target.kind) && !self) {
    const verdict = judge('present-alive', () => capableVerdict(sheet));
    const position = actions.findIndex((action) => action.id === 'inspect');
    const asks = askTopics(inputs, target.entityId).map((topic) =>
      toAction('ask_about', verdict, topic.relevance, topic.ref),
    );
    actions.splice(position, 0, ...asks);
  }
  // Stable: equal relevance keeps catalog order.
  return actions.sort((a, b) => RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance]);
}

function toAction(
  id: ContextActionId,
  verdict: Verdict,
  relevance: Relevance,
  topic?: ContextAction['topic'],
): ContextAction {
  return {
    id,
    ...(topic ? { topic } : {}),
    legal: verdict.legal,
    ...(verdict.reason ? { reason: verdict.reason } : {}),
    ...(verdict.resolution ? { resolution: verdict.resolution } : {}),
    relevance,
    ...(verdict.cost ? { cost: verdict.cost } : {}),
    ...(verdict.hints ? { hints: [...verdict.hints] } : {}),
  };
}
