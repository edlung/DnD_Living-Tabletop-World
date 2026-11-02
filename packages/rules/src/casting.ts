import type { CharacterSheet, SpellcastingSource } from '@ltw/contracts';

import { MISTY_STEP_DISTANCE_FT, type CastingTime } from './catalog.ts';
import { slotsRemaining, sourcesFor, spellAttackBonus, spellSaveDc } from './character-math.ts';
import { moveRequiredFt } from './grid.ts';
import { spellRules } from './spell-rules.ts';
import { illegal, isIncapacitated, type Illegal, type TurnState } from './turn.ts';

/**
 * Spellcasting legality and resource use (docs/adr/0011-ruleset-srd-5-2.md).
 * Order of checks: capability, known spell, action economy, resource,
 * one-slot-per-turn, range/target. Effects are applied by `applyCast`.
 */
export interface CastRequest {
  /** A slice spell, or any SRD spell by its catalog id (docs/adr/0052-spells-as-data.md §1). */
  readonly spellId: string;
  /** Cast by a combatant in a running fight, where no spell of minutes or hours fits a turn. */
  readonly inFight?: boolean;
  /** A slot level, a slot-free cast (Favored Enemy, Magic Initiate), or a ritual (ADR 0052 §6). */
  readonly using: { readonly slotLevel: number } | 'free' | 'ritual';
  /** Distance and visibility of the target creature or point, if any. */
  readonly target?: { readonly distanceFt: number; readonly visible: boolean };
  /** Misty Step destination. */
  readonly destination?: {
    readonly distanceFt: number;
    readonly visible: boolean;
    readonly occupied: boolean;
  };
}

export interface CastPlan {
  readonly legal: true;
  readonly spellId: string;
  readonly source: SpellcastingSource;
  readonly economy: CastingTime | 'long';
  readonly slotLevel: number | null;
  /** A slot-free cast (Favored Enemy, Magic Initiate); a cantrip is neither. */
  readonly free: boolean;
  readonly saveDc: number;
  readonly attackBonus: number;
  /** Concentration spell this cast ends (starting a new Concentration ends the old one). */
  readonly endsConcentration: string | null;
}

export function checkCast(
  sheet: CharacterSheet,
  turn: TurnState,
  request: CastRequest,
): CastPlan | Illegal {
  const spell = spellRules(request.spellId);
  if (isIncapacitated(sheet)) return illegal('INCAPACITATED');
  const sources = sourcesFor(sheet, request.spellId);
  if (!spell || sources.length === 0) return illegal('NOT_KNOWN');
  if (spell.castingTime === 'long' && request.inFight === true) return illegal('TAKES_TOO_LONG');

  if (spell.castingTime === 'action' && (!turn.ownTurn || turn.actionUsed)) {
    return illegal(turn.ownTurn ? 'NO_ACTION' : 'NOT_YOUR_TURN');
  }
  if (spell.castingTime === 'bonus' && (!turn.ownTurn || turn.bonusActionUsed)) {
    return illegal(turn.ownTurn ? 'NO_BONUS_ACTION' : 'NOT_YOUR_TURN');
  }
  if (spell.castingTime === 'reaction' && !turn.reactionAvailable) return illegal('NO_REACTION');

  let source: SpellcastingSource | undefined;
  let slotLevel: number | null = null;
  if (spell.level === 0) {
    // A cantrip spends no slot and no free cast (docs/adr/0052-spells-as-data.md §5).
    source = sources[0];
  } else if (request.using === 'ritual') {
    // A ritual spends no slot, and takes ten minutes more: no fight's turn holds it.
    if (!spell.ritual) return illegal('NOT_A_RITUAL');
    if (request.inFight === true) return illegal('TAKES_TOO_LONG');
    source = sources[0];
  } else if (request.using === 'free') {
    source = sources.find(
      (candidate) =>
        candidate.freeCasts?.spellId === request.spellId &&
        candidate.freeCasts.used < candidate.freeCasts.perLongRest,
    );
    if (!source) return illegal('NO_FREE_CAST');
  } else {
    slotLevel = request.using.slotLevel;
    if (!Number.isInteger(slotLevel) || slotLevel < 1 || slotLevel > 9) return illegal('NO_SLOT');
    if (slotLevel < spell.level) return illegal('SLOT_TOO_LOW');
    if (slotsRemaining(sheet, slotLevel) <= 0) return illegal('NO_SLOT');
    if (turn.slotExpendedThisTurn) return illegal('SLOT_ALREADY_USED_THIS_TURN');
    source = sources[0];
  }
  if (!source) return illegal('NOT_KNOWN');

  const targetCheck = checkTarget(request, spell);
  if (targetCheck) return targetCheck;

  return {
    legal: true,
    spellId: request.spellId,
    source,
    economy: spell.castingTime,
    slotLevel,
    free: spell.level > 0 && request.using === 'free',
    saveDc: spellSaveDc(sheet, source),
    attackBonus: spellAttackBonus(sheet, source),
    endsConcentration: spell.concentration ? (sheet.concentration?.spellId ?? null) : null,
  };
}

function checkTarget(
  request: CastRequest,
  spell: NonNullable<ReturnType<typeof spellRules>>,
): Illegal | null {
  if (request.spellId === 'misty-step') {
    const destination = request.destination;
    if (!destination) return illegal('TARGET_REQUIRED');
    if (!destination.visible || destination.occupied) return illegal('DESTINATION_INVALID');
    if (destination.distanceFt > MISTY_STEP_DISTANCE_FT) return illegal('OUT_OF_RANGE');
    return null;
  }
  if (spell.range === 'self') return null;
  const target = request.target;
  if (!target) return illegal('TARGET_REQUIRED');
  if (spell.needsVisibleTarget && !target.visible) return illegal('TARGET_NOT_VISIBLE');
  if (target.distanceFt > spell.range) {
    return illegal('OUT_OF_RANGE', {
      moveRequiredFt: moveRequiredFt(target.distanceFt, spell.range),
    });
  }
  return null;
}

/** Applies a legal cast: action economy, slot or free use, Concentration. */
export function applyCast(
  sheet: CharacterSheet,
  turn: TurnState,
  plan: CastPlan,
): { sheet: CharacterSheet; turn: TurnState } {
  const nextTurn: TurnState = {
    ...turn,
    actionUsed: turn.actionUsed || plan.economy === 'action',
    bonusActionUsed: turn.bonusActionUsed || plan.economy === 'bonus',
    reactionAvailable: turn.reactionAvailable && plan.economy !== 'reaction',
    slotExpendedThisTurn: turn.slotExpendedThisTurn || plan.slotLevel !== null,
  };
  const expended = [...sheet.spellSlots.expended];
  if (plan.slotLevel !== null)
    expended[plan.slotLevel - 1] = (expended[plan.slotLevel - 1] ?? 0) + 1;
  const spellcasting = sheet.spellcasting.map((source) =>
    plan.free && source === plan.source && source.freeCasts
      ? { ...source, freeCasts: { ...source.freeCasts, used: source.freeCasts.used + 1 } }
      : source,
  );
  const concentration = spellRules(plan.spellId)?.concentration
    ? { spellId: plan.spellId }
    : sheet.concentration;
  return {
    sheet: { ...sheet, spellSlots: { ...sheet.spellSlots, expended }, spellcasting, concentration },
    turn: nextTurn,
  };
}
