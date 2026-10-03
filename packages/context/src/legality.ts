import type {
  CharacterSheet,
  ContextActionCost,
  ContextEntityRef,
  ContextHint,
  ContextIllegalReason,
  SpellId,
} from '@ltw/contracts';
import {
  SPELLS,
  beginAttackAction,
  checkCast,
  checkWeaponAttack,
  isIncapacitated,
  slotsRemaining,
  startTurn,
  type Illegal,
} from '@ltw/rules';

/**
 * Legality of contextual actions (docs/adr/0012-context-engine.md "Legality").
 * The Rules Engine decides; this module only frames the question. Outside
 * combat no turn order or canonical positions exist, so an action is
 * evaluated as at the start of a fresh turn of the acting character and
 * range is not evaluated (hint `RANGE_NOT_TRACKED`). In combat, `combat.ts`
 * applies the encounter's positions and turn state instead (ADR 0015 §6).
 */
export interface Verdict {
  readonly legal: boolean;
  readonly reason?: ContextIllegalReason;
  readonly resolution?: { readonly moveRequiredFt?: number };
  readonly cost?: ContextActionCost;
  readonly hints?: readonly ContextHint[];
  /** Area spells: the combatants affected (ADR 0015 §6). */
  readonly area?: readonly ContextEntityRef[];
}

export const LEGAL: Verdict = { legal: true };
const RANGE_HINT: readonly ContextHint[] = ['RANGE_NOT_TRACKED'];

export const illegalBecause = (reason: ContextIllegalReason): Verdict => ({ legal: false, reason });

/** Rules reasons are a subset of context reasons (checked by the compiler). */
function fromRules(result: Illegal, extra: Partial<Verdict> = {}): Verdict {
  const reason: ContextIllegalReason = result.reason;
  return {
    legal: false,
    reason,
    ...(result.resolution ? { resolution: { ...result.resolution } } : {}),
    ...extra,
  };
}

/** Exploration-time target: present and seen; distance is not tracked. */
const UNTRACKED_TARGET = { distanceFt: 0, visible: true } as const;

/**
 * Prefers a slot-free cast, then the lowest slot that can cast the spell.
 * With nothing left, asks the rules about the spell's own level so the
 * reported reason is the rules' (`NO_SLOT`).
 */
function chooseCost(sheet: CharacterSheet, spellId: SpellId): ContextActionCost {
  const free = sheet.spellcasting.some(
    (source) =>
      source.freeCasts?.spellId === spellId && source.freeCasts.used < source.freeCasts.perLongRest,
  );
  if (free) return { kind: 'free' };
  const level = SPELLS[spellId].level;
  for (let slotLevel = level; slotLevel <= 9; slotLevel += 1) {
    if (slotsRemaining(sheet, slotLevel) > 0) return { kind: 'slot', slotLevel };
  }
  return { kind: 'slot', slotLevel: level };
}

export function spellVerdict(sheet: CharacterSheet | undefined, spellId: SpellId): Verdict {
  if (!sheet) return illegalBecause('NO_CHARACTER_SHEET');
  const cost = chooseCost(sheet, spellId);
  const targeted = SPELLS[spellId].range !== 'self';
  const plan = checkCast(sheet, startTurn(true), {
    spellId,
    using: cost.kind === 'free' ? 'free' : { slotLevel: cost.slotLevel },
    ...(targeted ? { target: UNTRACKED_TARGET } : {}),
  });
  if (!plan.legal) return fromRules(plan);
  return { legal: true, cost, ...(targeted ? { hints: RANGE_HINT } : {}) };
}

export function longbowVerdict(sheet: CharacterSheet | undefined): Verdict {
  if (!sheet) return illegalBecause('NO_CHARACTER_SHEET');
  const turn = beginAttackAction(sheet, startTurn(true));
  if ('legal' in turn) return fromRules(turn);
  const plan = checkWeaponAttack(sheet, turn, 'longbow', {
    ...UNTRACKED_TARGET,
    targetAc: 0,
    cover: 'none',
  });
  if (!plan.legal) return fromRules(plan);
  return { legal: true, hints: RANGE_HINT };
}

/**
 * Skill checks on evidence (docs/adr/0013-investigation.md §2): a capable actor
 * with a canonical sheet, one attempt per entity and method.
 */
export function checkVerdict(sheet: CharacterSheet | undefined, attempted: boolean): Verdict {
  const capable = capableVerdict(sheet);
  if (!capable.legal) return capable;
  if (!sheet) return illegalBecause('NO_CHARACTER_SHEET');
  return attempted ? illegalBecause('ALREADY_ATTEMPTED') : LEGAL;
}

/** Speech needs only a capable actor (Incapacitated: SRD 5.2.1). */
export function capableVerdict(sheet: CharacterSheet | undefined): Verdict {
  return sheet && isIncapacitated(sheet) ? illegalBecause('INCAPACITATED') : LEGAL;
}
