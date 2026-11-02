import type { ContextAction, ContextActionId, Relevance } from '@ltw/contracts';
import {
  attemptKey,
  combatantOf,
  insightKey,
  isCombatant,
  wieldedWeapons,
  type EntityState,
} from '@ltw/domain';

import {
  combatAttackVerdict,
  combatFrame,
  combatSpellVerdict,
  counterspellVerdict,
  combatActionVerdict,
  fireballVerdict,
} from './combat.ts';
import { showableEvidence } from './evidence.ts';
import type { ContextInputs } from './inputs.ts';
import {
  LEGAL,
  capableVerdict,
  checkVerdict,
  illegalBecause,
  longbowVerdict,
  spellVerdict,
  unavailable,
  type Verdict,
} from './legality.ts';
import { RELEVANCE_RANK, memoriesAbout } from './relevance.ts';
import { entityRefFor } from './views.ts';
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
  const npc = target.kind === 'npc' && !self;
  const { attempts } = inputs.state.investigation;
  const { sheet } = inputs;
  const examine: Relevance = present && OBJECT_KINDS.has(target.kind) ? 'medium' : 'low';
  // In combat, legality uses the encounter's positions and turn (ADR 0015 §6).
  const frame = combatFrame(inputs);
  // Outside a fight, its combatants are out of a spell's reach, as the World
  // Engine decides: the last reason, after the caster's own (Gate 03, G03-H06).
  const encounter = inputs.state.encounter;
  const fighting = encounter !== null && combatantOf(encounter, target.entityId) !== undefined;
  const outside = (verdict: Verdict, targeted: boolean): Verdict =>
    verdict.legal && targeted && fighting ? illegalBecause('TARGET_IN_COMBAT') : verdict;
  const spell = (spellId: 'healing-word' | 'hunters-mark' | 'detect-magic', targeted: boolean) =>
    frame
      ? () => combatSpellVerdict(inputs, spellId, targeted ? target.entityId : undefined)
      : () => outside(spellVerdict(sheet, spellId), targeted);

  const candidates: Candidate[] = [];
  const add = (
    id: ContextActionId,
    requires: Requirement,
    verdict: () => Verdict,
    relevance: Relevance,
  ) => candidates.push({ id, requires, verdict, relevance });

  if (CREATURE_KINDS.has(target.kind)) {
    // A pending candidate of the open reaction window may counter its caster
    // (ADR 0016 §4): first in the catalog, since the encounter waits for it.
    const counter = frame && !self ? counterspellVerdict(frame, inputs, target.entityId) : null;
    if (counter) add('counterspell', 'present-alive', () => counter, 'high');
    if (npc) {
      // Talk and Insight are NPC dialogue (ADR 0020 §1); Trade is not carried out in the slice.
      add(
        'talk',
        'present-alive',
        () => capableVerdict(sheet),
        present && alive ? 'medium' : 'low',
      );
      add('trade', 'present-alive', () => unavailable(capableVerdict(sheet)), 'low');
    }
    add('inspect', 'present', () => LEGAL, 'low');
    if (npc) {
      const read = attempts.has(insightKey(inputs.actor.entityId, target.entityId));
      add('insight_check', 'present-alive', () => checkVerdict(sheet, read), 'low');
    }
    const wounded = (() => {
      const hp = inputs.party.has(target.entityId)
        ? inputs.state.characterSheets.get(target.entityId)?.hitPoints
        : undefined;
      return hp !== undefined && hp.current < hp.max;
    })();
    add(
      'healing_word',
      'present-alive',
      spell('healing-word', true),
      present && alive && wounded ? 'high' : 'low',
    );
    // The actions beside Attack and Magic (ADR 0045 §5): one's own, and Help or Ready at another.
    if (frame && self) {
      for (const own of [
        'dodge',
        'dash',
        'disengage',
        'hide',
        'search',
        'study',
        'utilize',
      ] as const)
        add(own, 'present-alive', () => combatActionVerdict(frame, inputs, own), 'low');
    }
    if (frame && !self) {
      for (const at of ['help', 'ready', 'influence'] as const)
        add(
          at,
          'present-alive',
          () => combatActionVerdict(frame, inputs, at, target.entityId),
          'low',
        );
    }
    if (!self) {
      add('hunters_mark', 'present-alive', spell('hunters-mark', true), 'low');
      add(
        'longbow_attack',
        'present-alive',
        frame
          ? () => combatAttackVerdict(frame, inputs, target.entityId)
          : () => longbowVerdict(sheet),
        'low',
      );
      if (frame)
        add(
          'fireball',
          'present',
          () => fireballVerdict(frame, inputs, target.entityId, (id) => entityRefFor(inputs, id)),
          'low',
        );
    }
  } else if (OBJECT_KINDS.has(target.kind)) {
    add('inspect', 'present', () => LEGAL, examine);
    const attempted = (method: 'investigation' | 'perception') =>
      inputs.state.investigation.attempts.has(
        attemptKey(inputs.actor.entityId, target.entityId, method),
      );
    add(
      'investigation_check',
      'present',
      () => checkVerdict(sheet, attempted('investigation')),
      examine,
    );
    add('perception_check', 'present', () => checkVerdict(sheet, attempted('perception')), examine);
    add('detect_magic', 'present', spell('detect-magic', false), 'low');
    // An uncarried item can be picked up (ADR 0039); a combatant handles no items.
    if (target.kind === 'item' && target.status === 'active') {
      const carried = inputs.state.possessions.get(target.entityId)?.holderId ?? null;
      if (carried === null)
        add(
          'take_item',
          'present',
          () =>
            isCombatant(inputs.state, inputs.actor.entityId) ? illegalBecause('IN_COMBAT') : LEGAL,
          examine,
        );
    }
  } else if (target.kind === 'location') {
    add('inspect', 'present', () => LEGAL, 'low');
    const here = inputs.actor.placement?.locationId === target.entityId;
    add('enter_location', 'none', () => (here ? illegalBecause('ALREADY_HERE') : LEGAL), 'low');
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
      toAction('ask_about', verdict, topic.relevance, { topic: topic.ref }),
    );
    const shows = npc
      ? showableEvidence(inputs, target.entityId, present && alive).map((evidence) =>
          toAction('show_evidence', verdict, evidence.relevance, {
            evidence: { knowledgeId: evidence.knowledgeId },
          }),
        )
      : [];
    actions.splice(position, 0, ...asks, ...shows);
  }
  // In a fight, an attack with every other weapon the actor wields or lists (Stage 520).
  if (frame && CREATURE_KINDS.has(target.kind) && !self) {
    const weapons = [
      ...new Set([
        ...(sheet?.weapons ?? []),
        ...wieldedWeapons(inputs.state, inputs.actor.entityId),
      ]),
    ].filter((weaponId) => weaponId !== 'longbow');
    const after = actions.findIndex((action) => action.id === 'longbow_attack') + 1;
    const strikes = weapons.map((weaponId) =>
      toAction(
        'weapon_attack',
        judge('present-alive', () => combatAttackVerdict(frame, inputs, target.entityId, weaponId)),
        'low',
        { weapon: weaponId },
      ),
    );
    actions.splice(after, 0, ...strikes);
  }
  // Stable: equal relevance keeps catalog order.
  return actions.sort((a, b) => RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance]);
}

function toAction(
  id: ContextActionId,
  verdict: Verdict,
  relevance: Relevance,
  about: Pick<ContextAction, 'topic' | 'evidence' | 'weapon'> = {},
): ContextAction {
  return {
    id,
    ...(about.topic ? { topic: about.topic } : {}),
    ...(about.evidence ? { evidence: { knowledgeId: about.evidence.knowledgeId } } : {}),
    ...(about.weapon ? { weapon: about.weapon } : {}),
    legal: verdict.legal,
    ...(verdict.reason ? { reason: verdict.reason } : {}),
    ...(verdict.resolution ? { resolution: verdict.resolution } : {}),
    relevance,
    ...(verdict.cost ? { cost: verdict.cost } : {}),
    ...(verdict.hints ? { hints: [...verdict.hints] } : {}),
    ...(verdict.area ? { area: { affected: verdict.area.map((ref) => ({ ...ref })) } } : {}),
  };
}
