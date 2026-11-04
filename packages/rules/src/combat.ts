import type { Condition, CoverLevel, MonsterAttack } from '@ltw/contracts';

import { attackerTilt, targetTilt } from './conditions.ts';
import type { Dice } from './dice.ts';
import { distanceFt, moveRequiredFt, type Position } from './grid.ts';
import { illegal, type Illegal } from './turn.ts';

/**
 * Combat mechanics for the slice (SRD 5.2.1; docs/adr/0015-combat-engine.md).
 * Pure functions: randomness only through `Dice`.
 */

/** Cover bonus to AC and Dexterity saves; total cover cannot be targeted. */
export const COVER_BONUS: Readonly<Record<Exclude<CoverLevel, 'total'>, number>> = {
  half: 2,
  'three-quarters': 5,
};

/** A battlefield square at ground level (ADR 0015 keeps elevation at 0). */
export const onGround = (square: { readonly x: number; readonly y: number }): Position => ({
  x: square.x,
  y: square.y,
  elevationFt: 0,
});

/** Feet between two battlefield squares. */
export const squareDistanceFt = (
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number => distanceFt(onGround(a), onGround(b));

/** Squares of an area: every square within `radiusFt` of the point (grid distance, ADR 0011). */
export const withinArea = (
  point: { readonly x: number; readonly y: number },
  square: { readonly x: number; readonly y: number },
  radiusFt: number,
): boolean => squareDistanceFt(point, square) <= radiusFt;

export interface AttackCircumstances {
  /**
   * The attacker's conditions as they bear on this attack: Grappled left out against its grappler,
   * Frightened left out while its source is away (docs/adr/0045-conditions-and-actions.md §1).
   */
  readonly attackerConditions: readonly Condition[];
  readonly targetConditions: readonly Condition[];
  readonly melee: boolean;
  readonly distanceFt: number;
  readonly longRange: boolean;
  /**
   * The actions' marks (docs/adr/0045-conditions-and-actions.md §5): the target Dodges (and may,
   * neither Incapacitated nor at Speed 0), or an ally of the attacker Helps against it.
   */
  readonly targetDodging?: boolean;
  readonly helped?: boolean;
  /**
   * The weapons' rules (docs/adr/0047-weapons.md): a ranged attack made within 5 ft of a foe that
   * sees the attacker and is not Incapacitated; a Heavy weapon its wielder is too weak for; Vex's
   * Advantage against this target; Sap's Disadvantage on the attacker's next attack.
   */
  readonly foeClose?: boolean;
  readonly tooHeavy?: boolean;
  readonly vexing?: boolean;
  readonly sapped?: boolean;
  /**
   * Squeezed into a space a size smaller (docs/adr/0049-space-and-movement.md §4): the attacker's
   * rolls have Disadvantage, and rolls against the target Advantage.
   */
  readonly attackerSqueezed?: boolean;
  readonly targetSqueezed?: boolean;
  /** A weapon that drags under water (`underwaterDisadvantage`, ADR 0049 §11). */
  readonly underwater?: boolean;
  /**
   * Unseen attackers and targets (docs/adr/0050-the-world-around.md §3): the attacker cannot see
   * its target in the dark or the fog — Disadvantage; the target cannot see its attacker —
   * Advantage. Invisible and Blinded are the conditions' own.
   */
  readonly targetUnseen?: boolean;
  readonly attackerUnseen?: boolean;
}

/**
 * Advantage and Disadvantage from position and conditions (SRD 5.2.1, ADR 0045 §1): the
 * attacker's own conditions (`attackerTilt`), the target's (`targetTilt`, a hit from within 5 ft
 * on a Paralyzed or Unconscious target a Critical Hit), a prone target — melee attacks within
 * 5 ft have Advantage, other attacks Disadvantage — long range's Disadvantage, and the weapons'
 * (ADR 0047). Both cancel when both apply (d20Test does that).
 */
export function attackCircumstances(c: AttackCircumstances): {
  advantage: boolean;
  disadvantage: boolean;
  criticalOnHit: boolean;
} {
  const close = c.distanceFt <= 5;
  const attacker = attackerTilt(c.attackerConditions);
  const target = targetTilt(c.targetConditions, close);
  const targetProne =
    c.targetConditions.includes('prone') || c.targetConditions.includes('unconscious');
  const advantage =
    attacker.advantage ||
    target.advantage ||
    (targetProne && c.melee && close) ||
    c.helped === true ||
    c.vexing === true ||
    c.targetSqueezed === true ||
    c.attackerUnseen === true;
  const disadvantage =
    attacker.disadvantage ||
    target.disadvantage ||
    c.longRange ||
    (targetProne && !(c.melee && close)) ||
    c.targetDodging === true ||
    (!c.melee && c.foeClose === true) ||
    c.tooHeavy === true ||
    c.sapped === true ||
    c.attackerSqueezed === true ||
    c.underwater === true ||
    c.targetUnseen === true;
  return { advantage, disadvantage, criticalOnHit: target.criticalOnHit };
}

/** Legality of a stat-block attack at a distance (reach, or range bands with long-range Disadvantage). */
export function checkMonsterAttack(
  attack: MonsterAttack,
  distance: number,
  cover: CoverLevel | 'none',
): { legal: true; longRange: boolean } | Illegal {
  if (cover === 'total') return illegal('TOTAL_COVER');
  const limit = attack.kind === 'melee' ? (attack.reachFt ?? 5) : (attack.longRangeFt ?? 0);
  if (distance > limit) {
    return illegal('OUT_OF_RANGE', { moveRequiredFt: moveRequiredFt(distance, limit) });
  }
  return {
    legal: true,
    longRange: attack.kind === 'ranged' && distance > (attack.normalRangeFt ?? 0),
  };
}

export interface DeathSaves {
  readonly successes: number;
  readonly failures: number;
}

export type DeathSaveOutcome = 'success' | 'failure' | 'stable' | 'dead' | 'revived';

/**
 * A death saving throw (SRD 5.2.1): d20, no modifier, 10 or higher succeeds.
 * Three successes: stable. Three failures: dead. A natural 20 regains 1 HP;
 * a natural 1 counts as two failures.
 */
export function rollDeathSave(
  dice: Dice,
  saves: DeathSaves,
): { roll: number; saves: DeathSaves; outcome: DeathSaveOutcome } {
  const roll = dice.roll(20);
  if (roll === 20) return { roll, saves: { successes: 0, failures: 0 }, outcome: 'revived' };
  if (roll >= 10) {
    const successes = Math.min(3, saves.successes + 1);
    return {
      roll,
      saves: { ...saves, successes },
      outcome: successes === 3 ? 'stable' : 'success',
    };
  }
  const failures = Math.min(3, saves.failures + (roll === 1 ? 2 : 1));
  return { roll, saves: { ...saves, failures }, outcome: failures === 3 ? 'dead' : 'failure' };
}

/**
 * Damage to a creature already at 0 HP (SRD 5.2.1): one death save failure,
 * two on a Critical Hit; damage of at least its HP maximum kills outright.
 */
export function damageAtZero(
  saves: DeathSaves,
  damage: number,
  maxHp: number,
  critical: boolean,
): { saves: DeathSaves; dead: boolean } {
  if (damage >= maxHp) return { saves: { ...saves, failures: 3 }, dead: true };
  const failures = Math.min(3, saves.failures + (critical ? 2 : 1));
  return { saves: { successes: 0, failures }, dead: failures === 3 };
}

export interface InitiativeEntry {
  readonly id: string;
  readonly total: number;
  readonly dexterity: number;
}

/** Turn order: highest total, then higher Dexterity score, then entity ID (ADR 0015 §2). */
export const initiativeOrder = <T extends InitiativeEntry>(entries: readonly T[]): T[] =>
  [...entries].sort(
    (a, b) => b.total - a.total || b.dexterity - a.dexterity || a.id.localeCompare(b.id),
  );
