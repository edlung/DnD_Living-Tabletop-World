import {
  accept,
  combatantOf,
  possessionOf,
  type CombatantRecord,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import type { TurnState } from '@ltw/rules';

import { combatantEvent, encounterOf, onTurn, withTurn } from './battlefield.ts';
import { revealed, withDetail } from './condition-details.ts';
import { attackPlan, type AttackPlan } from './legality.ts';
import { afterRoll, rollAgainst, specOf } from './reactions/attack-windows.ts';
import { combatPremises, refused } from './refusal.ts';

/**
 * `Attack` (docs/adr/0015-combat-engine.md §3): one attack of the Attack
 * action, or an extra one (docs/adr/0047-weapons.md: the other hand's, Cleave's).
 * A Critical Hit doubles every damage die, Hunter's Mark and the Goblin's
 * Advantage die included. Longbow Slow lasts until the start of the attacker's
 * next turn.
 */
type AttackCommand = Extract<CombatCommand, { type: 'Attack' }>;

/**
 * One attack as made: by the Attack action, as an opportunity or the readied attack (ADR 0046), or
 * an extra attack (ADR 0047).
 */
export interface MadeAttack {
  readonly attackerId: string;
  readonly targetId: string;
  readonly attackId: string;
  readonly by?: 'opportunity' | 'readied' | 'offhand' | 'cleave';
}

/** The attacker's record after the attack: its turn, the weapons' marks, Vex and Sap used. */
function attackerAfter(plan: AttackPlan, turn: TurnState): CombatantRecord {
  const record = withTurn(plan.attacker, turn);
  const marked = { ...record.turn, ...plan.marks };
  // Any attack ends Cleave's offer; Cleave's own made, it is used (ADR 0047 §2).
  delete marked.cleave;
  const after: CombatantRecord = { ...record, turn: marked };
  if (plan.vexed) delete after.vexing;
  if (plan.sapped) delete after.sappedBy;
  return after;
}

/** The ammunition a shot spends (docs/adr/0047-weapons.md §5), and the record that counts it. */
function spendAmmunition(
  state: WorldState,
  plan: AttackPlan,
  attacker: CombatantRecord,
): { readonly events: DraftEvent[]; readonly attacker: CombatantRecord } {
  const itemId = plan.ammunitionFrom;
  const stack = itemId === null ? undefined : possessionOf(state, itemId);
  if (itemId === null || !stack) return { events: [], attacker };
  const spent = attacker.ammunitionSpent ?? [];
  const before = spent.find((entry) => entry.itemId === itemId)?.spent ?? 0;
  return {
    events: [
      {
        type: 'ItemUsed',
        payload: { itemId, holderId: attacker.entityId, remaining: stack.quantity - 1 },
      },
    ],
    attacker: {
      ...attacker,
      ammunitionSpent: [
        ...spent.filter((entry) => entry.itemId !== itemId),
        { itemId, spent: Math.min(99, before + 1) },
      ],
    },
  };
}

/** The encounter with the attacker's own record as the attack leaves it, for what follows. */
const withRecord = (state: WorldState, record: CombatantRecord): WorldState =>
  state.encounter
    ? {
        ...state,
        encounter: {
          ...state.encounter,
          combatants: state.encounter.combatants.map((c) =>
            c.entityId === record.entityId ? record : c,
          ),
        },
      }
    : state;

/**
 * What a legal attack does, however it is paid: its roll, the Help it spends and the hidden attacker
 * it reveals (ADR 0045 §5); then, after the attacker's own record, what the roll leads to — a
 * window for a reroll or an answer to the hit, or the hit itself (docs/adr/0046 §3). The attacker's
 * record comes back with `turn` and without its hiding, for the caller to finish and record
 * between the two.
 */
export function resolveAttack(
  context: DecisionContext,
  state: WorldState,
  encounter: EncounterState,
  dice: Dice,
  ids: readonly string[],
  plan: AttackPlan,
  attack: MadeAttack,
  turn: TurnState,
  /** The caller's own change to the attacker's record (the readied attack ends its readiness). */
  finish: (record: CombatantRecord) => CombatantRecord = (record) => record,
): {
  readonly events: DraftEvent[];
  readonly attacker: CombatantRecord;
  readonly outcome: DraftEvent[];
} {
  const spec = specOf(plan);
  const rolled = rollAgainst(dice, spec);
  const events: DraftEvent[] = [
    {
      type: 'AttackPerformed',
      payload: {
        attackerId: attack.attackerId,
        targetId: attack.targetId,
        attackId: attack.attackId,
        rolls: [...rolled.rolls],
        modifier: plan.bonus,
        total: rolled.total,
        advantage: plan.advantage,
        disadvantage: plan.disadvantage,
        cover: plan.cover,
        critical: rolled.critical,
        hit: rolled.hit,
        ...(attack.by === undefined ? {} : { by: attack.by }),
        ...(plan.weapon.grip === null ? {} : { grip: plan.weapon.grip }),
        ...(plan.weapon.thrown ? { thrown: true as const } : {}),
      },
    },
  ];
  // Help is spent on this attack; a hidden attacker is found by it (ADR 0045 §5).
  const helper = plan.helpedBy === null ? undefined : combatantOf(encounter, plan.helpedBy);
  if (helper) {
    const helping = { ...helper.turn };
    delete helping.helping;
    events.push(combatantEvent({ ...helper, turn: helping }));
  }
  const spent = spendAmmunition(state, plan, attackerAfter(plan, turn));
  events.push(...spent.events);
  let attacker = spent.attacker;
  if (plan.hidden) {
    events.push(...revealed(attack.attackerId, plan.attackerVitals));
    attacker = withDetail(attacker, 'invisible', null);
  }
  attacker = finish(attacker);
  // What the roll leads to reads the attacker as this attack leaves it (Vex, Cleave's offer).
  const outcome = afterRoll(context, withRecord(state, attacker), dice, ids, attack, spec, rolled);
  return { events, attacker, outcome };
}

export function decideAttack(
  context: DecisionContext,
  command: AttackCommand,
  dice: Dice,
): Decision {
  const { state } = context;
  const encounter = encounterOf(state);
  if (!encounter.ok) return encounter;
  const current = onTurn(encounter.value, command.combatantId);
  if (!current.ok) return current;
  const plan = attackPlan(
    state,
    encounter.value,
    command.combatantId,
    command.attackId,
    command.targetId,
    'action',
    {
      ...(command.extra === undefined ? {} : { extra: command.extra }),
      ...(command.push === undefined ? {} : { push: command.push }),
      ...(command.topple === undefined ? {} : { topple: command.topple }),
    },
  );
  if (!plan.legal) return refused(plan);
  const { events, attacker, outcome } = resolveAttack(
    context,
    state,
    encounter.value,
    dice,
    command.resolution?.ids ?? [],
    plan,
    {
      attackerId: command.combatantId,
      targetId: command.targetId,
      attackId: command.attackId,
      ...(command.extra === undefined ? {} : { by: command.extra }),
    },
    // An extra attack is beside the Attack action's (ADR 0047 §2, §4).
    command.extra === undefined
      ? { ...plan.turn, attacksRemaining: plan.turn.attacksRemaining - 1 }
      : plan.turn,
  );
  return accept(
    combatPremises(state, command.combatantId),
    ...events,
    combatantEvent(attacker),
    ...outcome,
  );
}
