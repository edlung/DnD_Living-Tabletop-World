import type { CharacterSheet, CoverLevel, MonsterSpell, SpellId, Square } from '@ltw/contracts';
import {
  combatantOf,
  perceivedEntityIds,
  type CombatantRecord,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import {
  SPELLS,
  applyCast,
  checkCast,
  gapToSquareFt,
  moveRequiredFt,
  slotsRemaining,
  squaresOf,
  startTurn,
  type CastPlan,
  type CastRequest,
  type TurnState,
} from '@ltw/rules';

import {
  coverAt,
  fitsOnField,
  gapBetween,
  inBounds,
  isAlive,
  occupant,
  placedOf,
  turnStateOf,
} from './battlefield.ts';
import { charmedBy } from './condition-details.ts';
import { fireballArea, type CombatReason, type Refusal } from './legality.ts';
import { isObject, isObjectIn } from './objects.ts';
import { incapacitated, vitalsOf, type Vitals } from './vitals.ts';

/**
 * Spell legality (docs/adr/0015-combat-engine.md §3). Character slice spells
 * go through the Rules Engine (`checkCast`); in combat with real distances
 * and the turn's economy, outside combat as at the start of a fresh turn
 * with range not tracked (ADR 0012). Fireball and Misty Step need the
 * battlefield. Counterspell is a reaction (Stage 90).
 *
 * A fight and the world outside it do not touch: a combatant's spells reach
 * only combatants, and a caster outside the fight cannot target its
 * combatants (`TARGET_IN_COMBAT`; owner decision, Gate 03 retest 2, G03-H06).
 * That refusal comes last, so it tells the caster only what it could see: a
 * creature it perceives is fighting. Nothing outside a fight can then change
 * what an open reaction window depends on, so nothing outside can probe it.
 */
const refuse = (reason: CombatReason, resolution?: Refusal['resolution']): Refusal =>
  resolution ? { legal: false, reason, resolution } : { legal: false, reason };

export type Using = 'free' | { readonly slotLevel: number };

/** What casting spends: a suspended cast already spent it (ADR 0016). */
export type Economy = 'action' | 'bonus';

/**
 * The turn as if `refund` had not been spent yet: a cast suspended by a
 * reaction window resolves later with the economy it already paid for.
 */
export function refunded(turn: TurnState, refund: Economy | undefined): TurnState {
  if (refund === undefined) return turn;
  return refund === 'action' ? { ...turn, actionUsed: false } : { ...turn, bonusActionUsed: false };
}

export interface TargetInfo {
  readonly entityId: string;
  readonly vitals: Vitals | null;
  readonly record: CombatantRecord | null;
  readonly cover: Exclude<CoverLevel, 'total'> | 'none';
}

export interface CharacterSpellPlan {
  readonly legal: true;
  readonly spellId: SpellId;
  readonly cast: CastPlan;
  /** The caster's sheet and turn after paying for the spell. */
  readonly sheet: CharacterSheet;
  readonly turn: TurnState;
  readonly record: CombatantRecord | null;
  readonly target: TargetInfo | null;
  readonly point: Square | null;
  readonly area: readonly CombatantRecord[];
}

/** Free first, then the lowest slot that can cast it (as the Context Engine shows). */
export function chooseUsing(sheet: CharacterSheet, spellId: SpellId): Using {
  const free = sheet.spellcasting.some(
    (s) => s.freeCasts?.spellId === spellId && s.freeCasts.used < s.freeCasts.perLongRest,
  );
  if (free) return 'free';
  const level = SPELLS[spellId].level;
  for (let slotLevel = level; slotLevel <= 9; slotLevel += 1) {
    if (slotsRemaining(sheet, slotLevel) > 0) return { slotLevel };
  }
  return { slotLevel: level };
}

export function characterSpellPlan(
  state: WorldState,
  casterId: string,
  request: {
    readonly spellId: SpellId;
    readonly using?: Using;
    readonly targetId?: string;
    readonly point?: Square;
  },
  refund?: Economy,
): CharacterSpellPlan | Refusal {
  const { spellId } = request;
  const caster = vitalsOf(state, casterId);
  if (caster?.kind !== 'character') return refuse('NOT_A_COMBATANT');
  if (!isAlive(state, casterId)) return refuse('ACTOR_DEAD');
  if (spellId === 'counterspell') return refuse('NO_VALID_TRIGGER');
  const encounter = state.encounter;
  const record = encounter ? (combatantOf(encounter, casterId) ?? null) : null;
  const turn = refunded(
    encounter && record ? turnStateOf(encounter, record) : startTurn(true),
    refund,
  );
  const using = request.using ?? chooseUsing(caster.sheet, spellId);

  let target: TargetInfo | null = null;
  let point: Square | null = null;
  let area: CombatantRecord[] = [];
  const castRequest: { -readonly [K in keyof CastRequest]: CastRequest[K] } = { spellId, using };

  if (spellId === 'hunters-mark' || spellId === 'healing-word') {
    if (request.targetId === undefined) return refuse('TARGET_REQUIRED');
    const located = locateTarget(state, encounter, record, casterId, request.targetId);
    if ('legal' in located) return located;
    target = located.target;
    castRequest.target = { distanceFt: located.distanceFt, visible: true };
  } else if (spellId === 'fireball' || spellId === 'misty-step') {
    if (!encounter || !record) return refuse('NOT_IN_COMBAT');
    if (request.point === undefined) return refuse('TARGET_REQUIRED');
    if (!inBounds(encounter, request.point)) return refuse('DESTINATION_INVALID');
    point = request.point;
    // From the caster's nearest square (docs/adr/0049-space-and-movement.md §1).
    const distanceFt = gapToSquareFt(placedOf(state, record), point);
    if (spellId === 'fireball') {
      castRequest.target = { distanceFt, visible: true };
      area = fireballArea(state, encounter, point);
    } else {
      // The caster's whole space must fit there (ADR 0049 §1).
      const there = { ...placedOf(state, record), position: point };
      const blocked =
        !fitsOnField(encounter, there) ||
        squaresOf(there).some(
          (square) =>
            occupant(state, encounter, square, casterId) !== undefined ||
            coverAt(encounter, square) === 'total',
        );
      castRequest.destination = { distanceFt, visible: true, occupied: blocked };
    }
  }

  if (incapacitated(caster)) return refuse('INCAPACITATED');
  // A Charmed caster aims no spell at its charmer (docs/adr/0045-conditions-and-actions.md §1).
  if (record && target && charmedBy(record, caster, target.entityId)) {
    return refuse('CHARMED_BY_TARGET');
  }
  const cast = checkCast(caster.sheet, turn, castRequest);
  if (!cast.legal) return refuse(cast.reason, cast.resolution);
  if (!record && target && encounter && combatantOf(encounter, target.entityId)) {
    return refuse('TARGET_IN_COMBAT');
  }
  const after = applyCast(caster.sheet, turn, cast);
  const sheet =
    spellId === 'hunters-mark' && target
      ? { ...after.sheet, concentration: { spellId, targetId: target.entityId } }
      : after.sheet;
  return { legal: true, spellId, cast, sheet, turn: after.turn, record, target, point, area };
}

function locateTarget(
  state: WorldState,
  encounter: EncounterState | null,
  record: CombatantRecord | null,
  casterId: string,
  targetId: string,
): { target: TargetInfo; distanceFt: number } | Refusal {
  if (encounter && record) {
    const targetRecord = combatantOf(encounter, targetId);
    if (!targetRecord) return refuse('NOT_A_COMBATANT');
    if (!isAlive(state, targetId)) return refuse('TARGET_DEAD');
    // The slice's spells name creatures (docs/adr/0048-hit-points.md §5).
    if (isObjectIn(state, targetId)) return refuse('NOT_A_CREATURE');
    const cover = coverAt(encounter, targetRecord.position);
    if (cover === 'total' && targetId !== casterId) return refuse('TOTAL_COVER');
    return {
      target: {
        entityId: targetId,
        vitals: vitalsOf(state, targetId),
        record: targetRecord,
        cover: cover === 'total' ? 'none' : cover,
      },
      distanceFt: gapBetween(state, record, targetRecord),
    };
  }
  // Outside combat: a present creature; range is not tracked (ADR 0012).
  if (!perceivedEntityIds(state, casterId).has(targetId)) return refuse('TARGET_NOT_VISIBLE');
  if (!isAlive(state, targetId)) return refuse('TARGET_DEAD');
  return {
    target: { entityId: targetId, vitals: vitalsOf(state, targetId), record: null, cover: 'none' },
    distanceFt: 0,
  };
}

export interface MonsterSpellPlan {
  readonly legal: true;
  readonly spell: MonsterSpell;
  readonly caster: Vitals;
  readonly record: CombatantRecord;
  readonly turn: TurnState;
  readonly target: TargetInfo & { readonly vitals: Vitals; readonly record: CombatantRecord };
  readonly distanceFt: number;
}

export function monsterSpellPlan(
  state: WorldState,
  encounter: EncounterState,
  casterId: string,
  spellId: string,
  targetId: string | undefined,
  refund?: Economy,
): MonsterSpellPlan | Refusal {
  const record = combatantOf(encounter, casterId);
  const caster = vitalsOf(state, casterId);
  if (!record || caster?.kind !== 'creature') return refuse('NOT_A_COMBATANT');
  if (!isAlive(state, casterId)) return refuse('ACTOR_DEAD');
  const turn = refunded(turnStateOf(encounter, record), refund);
  if (!turn.ownTurn) return refuse('NOT_YOUR_TURN');
  if (incapacitated(caster)) return refuse('INCAPACITATED');
  const spell = caster.block.spells.find((s) => s.spellId === spellId);
  if (!spell) return refuse('NOT_KNOWN');
  if (spell.castingTime === 'action' && turn.actionUsed) return refuse('NO_ACTION');
  if (spell.castingTime === 'bonus' && turn.bonusActionUsed) return refuse('NO_BONUS_ACTION');
  if (targetId === undefined) return refuse('TARGET_REQUIRED');
  const targetRecord = combatantOf(encounter, targetId);
  const targetVitals = vitalsOf(state, targetId);
  if (!targetRecord || !targetVitals) return refuse('NOT_A_COMBATANT');
  if (!isAlive(state, targetId)) return refuse('TARGET_DEAD');
  if (isObject(targetVitals)) return refuse('NOT_A_CREATURE');
  if (charmedBy(record, caster, targetId)) return refuse('CHARMED_BY_TARGET');
  const cover = coverAt(encounter, targetRecord.position);
  if (cover === 'total') return refuse('TOTAL_COVER');
  const distanceFt = gapBetween(state, record, targetRecord);
  if (distanceFt > spell.rangeFt) {
    return refuse('OUT_OF_RANGE', { moveRequiredFt: moveRequiredFt(distanceFt, spell.rangeFt) });
  }
  return {
    legal: true,
    spell,
    caster,
    record,
    turn: {
      ...turn,
      actionUsed: turn.actionUsed || spell.castingTime === 'action',
      bonusActionUsed: turn.bonusActionUsed || spell.castingTime === 'bonus',
    },
    target: { entityId: targetId, vitals: targetVitals, record: targetRecord, cover },
    distanceFt,
  };
}
