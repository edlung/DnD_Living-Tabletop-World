import {
  ACTION_SKILLS,
  SKILLS,
  type CombatAction,
  type KernelCommandOf,
  type Skill,
} from '@ltw/contracts';
import {
  accept,
  type CombatantRecord,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import {
  abilityModifier,
  checkEffects,
  d20Test,
  skillModifier,
  squareDistanceFt,
} from '@ltw/rules';

import {
  combatantEvent,
  coverAt,
  encounterOf,
  isAlive,
  onTurn,
  turnStateOf,
} from './battlefield.ts';
import { withDetail } from './condition-details.ts';
import { decideRelease, escapeDcOf, heldBy } from './unarmed.ts';
import type { Refusal } from './legality.ts';
import { isObjectIn } from './objects.ts';
import { combatPremises, refused } from './refusal.ts';
import {
  conditionsOf,
  exhaustionOf,
  has,
  hitPoints,
  incapacitated,
  knockedOutOf,
  speedOf,
  vitalsEvent,
  vitalsOf,
  withConditions,
  withSheet,
  type Vitals,
} from './vitals.ts';

/**
 * The actions beside Attack and Magic (docs/adr/0045-conditions-and-actions.md §5). Each spends
 * the Action of the creature whose turn it is; their marks live on its turn record until its next
 * turn starts. Shared by the decision and the Context Engine, so both apply one rule.
 */
/** A Dodge holds while the creature can move and act (SRD 5.2.1). */
export const isDodging = (record: CombatantRecord | undefined, vitals: Vitals): boolean =>
  record?.turn.dodging === true && !incapacitated(vitals) && speedOf(vitals) > 0;

/** Hide's DC (SRD 5.2.1). */
export const HIDE_DC = 15;

export interface ActionRequest {
  readonly action: CombatAction;
  readonly targetId?: string | undefined;
  readonly skill?: Skill | undefined;
  readonly readied?: { readonly attackId: string; readonly trigger: string } | undefined;
}

export interface ActionPlan {
  readonly legal: true;
  readonly actor: CombatantRecord;
  readonly vitals: Vitals;
  /** The skill a check of this action uses, if it has one. */
  readonly skill: Skill | null;
}

const refuse = (reason: Refusal['reason']): Refusal => ({ legal: false, reason });

export function actionPlan(
  state: WorldState,
  encounter: EncounterState,
  actor: CombatantRecord,
  request: ActionRequest,
): ActionPlan | Refusal {
  const vitals = vitalsOf(state, actor.entityId);
  if (!vitals) return refuse('NOT_A_COMBATANT');
  if (!isAlive(state, actor.entityId)) return refuse('ACTOR_DEAD');
  if (incapacitated(vitals)) return refuse('INCAPACITATED');
  const turn = turnStateOf(encounter, actor);
  if (!turn.ownTurn) return refuse('NOT_YOUR_TURN');
  const { action } = request;
  // Letting go takes no action (docs/adr/0047-weapons.md §3).
  if (action === 'release') {
    return heldBy(state, encounter, actor.entityId).length > 0
      ? { legal: true, actor, vitals, skill: null }
      : refuse('NOT_GRAPPLING');
  }
  if (turn.actionUsed) return refuse('NO_ACTION');
  if (action === 'escape' && !has(vitals, 'grappled')) return refuse('NOT_GRAPPLED');
  if (action === 'first-aid') {
    // A creature within 5 ft, dying or knocked out (docs/adr/0048-hit-points.md §4).
    const target = encounter.combatants.find((c) => c.entityId === request.targetId);
    const aided = target ? vitalsOf(state, target.entityId) : null;
    if (!target || !aided) return refuse('TARGET_REQUIRED');
    if (!isAlive(state, target.entityId)) return refuse('TARGET_DEAD');
    if (squareDistanceFt(actor.position, target.position) > 5) return refuse('OUT_OF_RANGE');
    if (!needsAid(aided)) return refuse('NEEDS_NO_AID');
    if (request.skill !== 'medicine') return refuse('INVALID_SKILL');
    return { legal: true, actor, vitals, skill: 'medicine' };
  }
  const skills = ACTION_SKILLS[action];
  if (skills) {
    if (request.skill === undefined || !skills.includes(request.skill)) {
      return refuse('INVALID_SKILL');
    }
    return { legal: true, actor, vitals, skill: request.skill };
  }
  if (action === 'help' || action === 'ready') {
    if (request.targetId === undefined) return refuse('TARGET_REQUIRED');
    const target = encounter.combatants.find((c) => c.entityId === request.targetId);
    if (!target || target.entityId === actor.entityId) return refuse('NOT_A_COMBATANT');
    if (!isAlive(state, target.entityId)) return refuse('TARGET_DEAD');
    if (action === 'help') {
      // Help in a fight: an enemy within 5 ft of the helper (SRD 5.2.1) — a creature to distract.
      if (target.side === actor.side) return refuse('NOT_A_FOE');
      if (isObjectIn(state, target.entityId)) return refuse('NOT_A_CREATURE');
      if (squareDistanceFt(actor.position, target.position) > 5) return refuse('OUT_OF_RANGE');
    }
    if (action === 'ready' && request.readied === undefined) return refuse('TARGET_REQUIRED');
    return { legal: true, actor, vitals, skill: null };
  }
  if (action === 'hide') {
    // Hide from behind Three-Quarters or Total Cover (light and sight are Stage 640g).
    const cover = coverAt(encounter, actor.position);
    if (cover !== 'three-quarters' && cover !== 'total') return refuse('NO_COVER_TO_HIDE');
    return { legal: true, actor, vitals, skill: 'stealth' };
  }
  return { legal: true, actor, vitals, skill: null };
}

/** First aid's DC (SRD 5.2.1). */
export const FIRST_AID_DC = 10;

/** Dying and not yet stable, or knocked out: first aid would help (ADR 0048 §4). */
export function needsAid(v: Vitals): boolean {
  const { current } = hitPoints(v);
  if (current === 0) return v.kind === 'character' && (v.sheet.deathSaves?.successes ?? 0) < 3;
  return knockedOutOf(v) && has(v, 'unconscious');
}

/** A check of the creature's skill, with its conditions' tilt and Exhaustion (ADR 0045 §1). */
function rollSkill(dice: Dice, vitals: Vitals, skill: Skill, dc = HIDE_DC) {
  const effects = checkEffects(conditionsOf(vitals), exhaustionOf(vitals));
  const base =
    vitals.kind === 'character'
      ? skillModifier(vitals.sheet, skill)
      : abilityModifier(vitals.block.abilities[SKILLS[skill]]);
  const modifier = base + effects.penalty;
  const roll = d20Test(dice, {
    modifier,
    target: dc,
    advantage: effects.advantage,
    disadvantage: effects.disadvantage,
  });
  return { ...roll, modifier };
}

export function decideTakeAction(
  context: DecisionContext,
  command: KernelCommandOf<'TakeAction'>,
  dice: Dice,
): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const current = onTurn(encounter.value, command.combatantId);
  if (!current.ok) return current;
  const plan = actionPlan(state, encounter.value, current.value, command);
  if (!plan.legal) return refused(plan);
  if (command.action === 'release') return decideRelease(context, command);
  const { actor, vitals, skill } = plan;
  const turn = { ...actor.turn, actionUsed: true };
  let record: CombatantRecord;
  switch (command.action) {
    case 'dash':
      // As far again as its Speed now allows (conditions and Exhaustion counted).
      record = { ...actor, turn: { ...turn, dashFt: (turn.dashFt ?? 0) + speedOf(vitals) } };
      break;
    case 'disengage':
      record = { ...actor, turn: { ...turn, disengaged: true } };
      break;
    case 'dodge':
      record = { ...actor, turn: { ...turn, dodging: true } };
      break;
    case 'help':
      record = { ...actor, turn: { ...turn, helping: command.targetId ?? actor.entityId } };
      break;
    case 'ready':
      record = {
        ...actor,
        turn: {
          ...turn,
          readied: {
            attackId: command.readied?.attackId ?? '',
            targetId: command.targetId ?? actor.entityId,
            trigger: command.readied?.trigger ?? '',
          },
        },
      };
      break;
    default:
      record = { ...actor, turn };
  }
  const events: DraftEvent[] = [combatPremises(state, command.combatantId)];
  // Escape: Athletics or Acrobatics against the grapple's DC, when its grappler is known; first
  // aid, Medicine against 10.
  const escapeDc = command.action === 'escape' ? escapeDcOf(state, actor) : null;
  const judgedDc = command.action === 'first-aid' ? FIRST_AID_DC : escapeDc;
  const check = skill === null ? null : rollSkill(dice, vitals, skill, judgedDc ?? HIDE_DC);
  const hidden = command.action === 'hide' && check !== null && check.success;
  const escaped = escapeDc !== null && check !== null && check.success;
  events.push({
    type: 'ActionTaken',
    payload: {
      combatantId: command.combatantId,
      action: command.action,
      ...(command.targetId === undefined ? {} : { targetId: command.targetId }),
      ...(check === null || skill === null
        ? {}
        : {
            check: {
              skill,
              rolls: [...check.rolls],
              modifier: check.modifier,
              total: check.total,
              ...(command.action === 'hide' || judgedDc !== null ? { success: check.success } : {}),
            },
          }),
    },
  });
  if (hidden) {
    // Hidden: Invisible until it attacks, casts a spell or is found (ADR 0045 §5).
    events.push(
      {
        type: 'ConditionApplied',
        payload: {
          targetId: command.combatantId,
          condition: 'invisible',
          applied: true,
          cause: 'hidden',
        },
      },
      vitalsEvent(withConditions(vitals, ['invisible'], [])),
    );
    record = withDetail(record, 'invisible', { hidden: true });
  }
  if (command.action === 'first-aid' && check?.success === true && command.targetId) {
    events.push(...firstAid(state, command.targetId));
  }
  if (escaped) {
    // Free of the grapple (docs/adr/0047-weapons.md §3).
    events.push(
      {
        type: 'ConditionApplied',
        payload: {
          targetId: command.combatantId,
          condition: 'grappled',
          applied: false,
          cause: 'escaped',
        },
      },
      vitalsEvent(withConditions(vitals, [], ['grappled'])),
    );
    record = withDetail(record, 'grappled', null);
  }
  events.push(combatantEvent(record));
  return accept(...events);
}

/** First aid that worked: the dying stable, the knocked out awake (ADR 0048 §4). */
function firstAid(state: WorldState, targetId: string): DraftEvent[] {
  const aided = vitalsOf(state, targetId);
  if (!aided) return [];
  if (hitPoints(aided).current === 0) {
    const failures = aided.kind === 'character' ? (aided.sheet.deathSaves?.failures ?? 0) : 0;
    return [
      vitalsEvent(
        withSheet(aided, (sheet) => ({ ...sheet, deathSaves: { successes: 3, failures } })),
      ),
    ];
  }
  return [
    {
      type: 'ConditionApplied',
      payload: { targetId, condition: 'unconscious', applied: false, cause: 'first-aid' },
    },
    vitalsEvent(withConditions(aided, [], ['unconscious'])),
  ];
}
