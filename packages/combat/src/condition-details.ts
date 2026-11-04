import type { Condition, ConditionDetails } from '@ltw/contracts';
import type {
  CombatantRecord,
  ConditionDetailRecord,
  Dice,
  DraftEvent,
  EncounterState,
  WorldState,
} from '@ltw/domain';

import { combatantEvent, isAlive } from './battlefield.ts';
import { spellSave } from './saves.ts';
import { conditionsOf, has, vitalsEvent, vitalsOf, withConditions, type Vitals } from './vitals.ts';

/**
 * How conditions in a fight end, and what they come from (docs/adr/0045-conditions-and-actions.md
 * §2): a duration counted at a named point of a named combatant's turns, a save at the end of each
 * of the affected creature's turns, a source. The details live on the combatant record; the
 * condition itself on the sheet or stat block.
 */

/**
 * The latest vitals and records of a fight's creatures within one decision. Each vitals or record
 * event holds a whole value and a later one replaces an earlier one, so every step reads what the
 * steps before it changed, and each event it returns carries all of it.
 */
export class FightWork {
  readonly state: WorldState;
  #combatants: readonly CombatantRecord[];
  readonly #vitals = new Map<string, Vitals>();

  constructor(state: WorldState, combatants: readonly CombatantRecord[]) {
    this.state = state;
    this.#combatants = combatants;
  }

  get combatants(): readonly CombatantRecord[] {
    return this.#combatants;
  }

  combatant(entityId: string): CombatantRecord | undefined {
    return this.#combatants.find((combatant) => combatant.entityId === entityId);
  }

  vitalsOf(entityId: string): Vitals | null {
    return this.#vitals.get(entityId) ?? vitalsOf(this.state, entityId);
  }

  /** New vitals: the event that records them. */
  vitals(next: Vitals): DraftEvent {
    this.#vitals.set(next.entityId, next);
    return vitalsEvent(next);
  }

  /** A new combatant record: the event that records it. */
  record(next: CombatantRecord): DraftEvent {
    this.#combatants = this.#combatants.map((combatant) =>
      combatant.entityId === next.entityId ? next : combatant,
    );
    return combatantEvent(next);
  }

  /** The order after a change of the encounter itself (a turn's start), records kept. */
  rebase(combatants: readonly CombatantRecord[]): void {
    this.#combatants = combatants;
  }

  /** The encounter with this work's records. */
  encounter(base: EncounterState): EncounterState {
    return { ...base, combatants: [...this.#combatants] };
  }
}

export const detailOf = (
  combatant: CombatantRecord | undefined,
  condition: Condition,
): ConditionDetailRecord | undefined =>
  combatant?.conditionDetails?.find((detail) => detail.condition === condition);

/** The creature a condition comes from (the charmer, the one it fears, the grappler), if named. */
export const sourceOf = (combatant: CombatantRecord | undefined, condition: Condition) =>
  detailOf(combatant, condition)?.sourceId ?? null;

const hasDetails = (details: ConditionDetails) =>
  details.sourceId !== undefined ||
  details.until !== undefined ||
  details.save !== undefined ||
  details.hidden === true;

/** The combatant with `condition`'s details replaced, or dropped (null, or nothing to keep). */
export function withDetail(
  combatant: CombatantRecord,
  condition: Condition,
  details: ConditionDetails | null,
): CombatantRecord {
  const others = (combatant.conditionDetails ?? []).filter(
    (detail) => detail.condition !== condition,
  );
  const next = details && hasDetails(details) ? [...others, { condition, ...details }] : others;
  const base = { ...combatant };
  delete base.conditionDetails;
  return next.length > 0 ? { ...base, conditionDetails: next } : base;
}

/** A condition ends: its record, the creature's vitals without it, its details dropped. */
export function endCondition(
  work: FightWork,
  entityId: string,
  condition: Condition,
  cause: string,
): DraftEvent[] {
  const events: DraftEvent[] = [];
  const vitals = work.vitalsOf(entityId);
  if (vitals && has(vitals, condition)) {
    events.push(
      {
        type: 'ConditionApplied',
        payload: { targetId: entityId, condition, applied: false, cause },
      },
      work.vitals(withConditions(vitals, [], [condition])),
    );
  }
  const combatant = work.combatant(entityId);
  if (combatant && detailOf(combatant, condition)) {
    events.push(work.record(withDetail(combatant, condition, null)));
  }
  return events;
}

/** Durations that run out at this point of `turnOf`'s turn; the others count one turn down. */
export function durationsAt(work: FightWork, turnOf: string, at: 'start' | 'end'): DraftEvent[] {
  const events: DraftEvent[] = [];
  for (const { entityId, conditionDetails } of [...work.combatants]) {
    for (const detail of conditionDetails ?? []) {
      const until = detail.until;
      if (until?.turnOf !== turnOf || until.at !== at) continue;
      const current = work.combatant(entityId);
      if (!current) continue;
      if (until.turns > 1) {
        const { condition, ...rest } = detail;
        events.push(
          work.record(
            withDetail(current, condition, {
              ...rest,
              until: { ...until, turns: until.turns - 1 },
            }),
          ),
        );
      } else {
        events.push(...endCondition(work, entityId, detail.condition, 'duration'));
      }
    }
  }
  return events;
}

/** The saves that end a creature's conditions, rolled at the end of its turn. */
export function savesAtEndOfTurn(work: FightWork, dice: Dice, entityId: string): DraftEvent[] {
  const events: DraftEvent[] = [];
  for (const detail of work.combatant(entityId)?.conditionDetails ?? []) {
    if (!detail.save) continue;
    const vitals = work.vitalsOf(entityId);
    if (!vitals || !has(vitals, detail.condition)) continue;
    // A spell's condition is a save against the spell (Magic Resistance, ADR 0053 §4).
    const save = spellSave(
      dice,
      vitals,
      detail.save.ability,
      detail.save.dc,
      'none',
      detail.spell === true ? 'spell' : 'condition',
      false,
      work.combatant(entityId)?.squeezed === true,
    );
    events.push(save.event);
    if (save.success) events.push(...endCondition(work, entityId, detail.condition, 'save'));
  }
  return events;
}

/** A combatant left the fight: what its turns would have ended, and what came from it, ends. */
export function leftTheFight(work: FightWork, leaverId: string): DraftEvent[] {
  const events: DraftEvent[] = [];
  for (const { entityId, conditionDetails } of [...work.combatants]) {
    for (const detail of conditionDetails ?? []) {
      if (detail.until?.turnOf === leaverId) {
        events.push(...endCondition(work, entityId, detail.condition, 'duration'));
      }
    }
  }
  return events;
}

/** The fight ends: a condition with a duration or a save ends with it (§2). */
export function fightEnded(work: FightWork): DraftEvent[] {
  const events: DraftEvent[] = [];
  for (const { entityId, conditionDetails } of [...work.combatants]) {
    for (const detail of conditionDetails ?? []) {
      if (detail.until || detail.save) {
        events.push(...endCondition(work, entityId, detail.condition, 'combat-ended'));
      }
    }
  }
  return events;
}

/**
 * The attacker's conditions as they bear on an attack at `targetId`: Grappled leaves out its
 * grappler, Frightened holds only while its source is in the fight and alive (§1).
 */
export function conditionsAgainst(
  state: WorldState,
  encounter: EncounterState,
  combatant: CombatantRecord,
  vitals: Vitals,
  targetId: string,
): Condition[] {
  return conditionsOf(vitals).filter((condition) => {
    if (condition === 'grappled') return sourceOf(combatant, 'grappled') !== targetId;
    if (condition === 'frightened') {
      const source = sourceOf(combatant, 'frightened');
      const present = encounter.combatants.some((other) => other.entityId === source);
      return source === null || (present && isAlive(state, source));
    }
    return true;
  });
}

/** Hidden by the Hide action (§5): Invisible until it attacks or casts a spell. */
export const isHidden = (combatant: CombatantRecord | null | undefined): boolean =>
  detailOf(combatant ?? undefined, 'invisible')?.hidden === true;

/** A hidden creature attacked or cast a spell: found. Its record drops the mark separately. */
export const revealed = (entityId: string, vitals: Vitals): DraftEvent[] => [
  {
    type: 'ConditionApplied',
    payload: { targetId: entityId, condition: 'invisible', applied: false, cause: 'revealed' },
  },
  vitalsEvent(withConditions(vitals, [], ['invisible'])),
];

/** A Charmed creature cannot attack its charmer (§1). */
export const charmedBy = (combatant: CombatantRecord, vitals: Vitals, targetId: string) =>
  has(vitals, 'charmed') && sourceOf(combatant, 'charmed') === targetId;
