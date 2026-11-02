import type {
  AttackExtra,
  CoverLevel,
  Damage,
  SpellId,
  Square,
  WeaponId,
  WeaponMastery,
} from '@ltw/contracts';
import {
  ammunitionOf,
  combatantOf,
  handsOf,
  type CombatantRecord,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import {
  COVER_BONUS,
  FIREBALL_RADIUS_FT,
  SHIELD_AC_BONUS,
  SPELLS,
  attackCircumstances,
  beginAttackAction,
  exhaustionPenalty,
  moveRequiredFt,
  proficiencyBonus,
  squaresOf,
  totalLevel,
  underwaterDisadvantage,
  withinArea,
  type Illegal,
  type IllegalReason,
  type TurnState,
} from '@ltw/rules';

import { isDodging } from './actions.ts';
import { coverOf, gapBetween, immersed, isAlive, placedOf, turnStateOf } from './battlefield.ts';
import { charmedBy, conditionsAgainst, detailOf } from './condition-details.ts';
import { isObjectIn } from './objects.ts';
import { hostileSides } from './reactions/opportunity.ts';
import {
  armorClass,
  conditionsOf,
  exhaustionOf,
  has,
  incapacitated,
  speedsOf,
  vitalsOf,
  type Vitals,
} from './vitals.ts';
import { weaponOf, type AttackDamage, type WeaponView } from './weapon-view.ts';

/**
 * Attack legality (docs/adr/0015-combat-engine.md §3), shared by the combat
 * decisions and the Context Engine so both apply one rule. The Rules Engine
 * decides every mechanic; this module only gathers its inputs from the
 * encounter.
 */
export type CombatReason =
  | IllegalReason
  | 'NOT_IN_COMBAT'
  | 'NOT_A_COMBATANT'
  | 'ACTOR_DEAD'
  | 'TARGET_DEAD'
  | 'TARGET_IN_COMBAT';
export type Refusal = {
  readonly legal: false;
  readonly reason: CombatReason;
  readonly resolution?: Illegal['resolution'];
};
const refuse = (reason: CombatReason, resolution?: Illegal['resolution']): Refusal =>
  resolution ? { legal: false, reason, resolution } : { legal: false, reason };

/**
 * How an attack is paid: the Attack action on the attacker's turn, or its Reaction — an
 * opportunity attack or the readied attack (docs/adr/0046-reactions-beyond-counterspell.md).
 */
export type AttackEconomy = 'action' | 'reaction';

/** What an attack asks before its roll (docs/adr/0047-weapons.md §2, §4). */
export interface AttackOptions {
  /** An extra attack: the other hand's (Light), or Cleave's second. */
  readonly extra?: AttackExtra;
  /** Push's feet on a hit (0: none; absent: 10), and Topple (absent: yes). */
  readonly push?: 0 | 5 | 10;
  readonly topple?: boolean;
  /** A melee attack that would bring it to 0 leaves it at 1, Unconscious (ADR 0048 §4). */
  readonly knockOut?: boolean;
}

/** A weapon's mastery as one attack uses it: Push's feet, Topple's DC, Graze's damage. */
export interface MasteryUse {
  readonly kind: WeaponMastery;
  readonly pushFt?: 0 | 5 | 10 | undefined;
  readonly dc?: number | undefined;
  readonly graze?: number | undefined;
}

/** The weapons' marks an attack leaves on its attacker's turn (docs/adr/0047-weapons.md). */
export interface WeaponMarks {
  readonly lightWeapon?: WeaponId;
  readonly offhandAttacked?: true;
  readonly cleaved?: true;
  readonly loadingFired?: true;
}

export interface AttackPlan {
  readonly legal: true;
  /** Whether the attack is melee: an opportunity attack must be (ADR 0046 §2). */
  readonly melee: boolean;
  readonly attacker: CombatantRecord;
  readonly target: CombatantRecord;
  readonly attackerVitals: Vitals;
  readonly targetVitals: Vitals;
  /** The attacker's turn after this attack begins (the Attack action is taken on the first attack). */
  readonly turn: TurnState;
  readonly bonus: number;
  readonly targetAc: number;
  readonly cover: Exclude<CoverLevel, 'total'> | 'none';
  readonly distanceFt: number;
  readonly longRange: boolean;
  readonly advantage: boolean;
  readonly disadvantage: boolean;
  readonly criticalOnHit: boolean;
  readonly damage: AttackDamage;
  readonly advantageDamage: Damage | null;
  readonly slow: boolean;
  readonly huntersMark: boolean;
  /** The ally whose Help gave this attack Advantage: it is spent (ADR 0045 §5). */
  readonly helpedBy: string | null;
  /** The attacker was hidden: attacking reveals it (§5). */
  readonly hidden: boolean;
  readonly weapon: WeaponView;
  readonly extra: AttackExtra | null;
  readonly marks: WeaponMarks;
  /** The stack whose piece this shot spends; null when its ammunition is not counted. */
  readonly ammunitionFrom: string | null;
  readonly mastery: MasteryUse | null;
  /** Vex's Advantage is used on this attack, and Sap's Disadvantage: both end with it. */
  readonly vexed: boolean;
  readonly sapped: boolean;
  /** Knocking out instead of killing: a melee attack's choice (ADR 0048 §4). */
  readonly knockOut: boolean;
}

const masteryUse = (
  weapon: WeaponView,
  extra: AttackExtra | null,
  options: AttackOptions,
  proficiency: number,
): MasteryUse | null => {
  switch (weapon.mastery) {
    case null:
    case 'nick':
      return null;
    case 'push': {
      const pushFt = options.push ?? 10;
      return pushFt === 0 ? null : { kind: 'push', pushFt };
    }
    case 'topple':
      return options.topple === false
        ? null
        : { kind: 'topple', dc: 8 + weapon.abilityModifier + proficiency };
    case 'graze':
      return weapon.abilityModifier > 0 ? { kind: 'graze', graze: weapon.abilityModifier } : null;
    case 'cleave':
      // Cleave's own second attack cleaves no further (once per turn).
      return weapon.melee && extra === null ? { kind: 'cleave' } : null;
    default:
      return { kind: weapon.mastery };
  }
};

/** A foe within 5 ft that sees the attacker and can act: a ranged attack has Disadvantage. */
function foeClose(state: WorldState, encounter: EncounterState, attacker: CombatantRecord) {
  const self = vitalsOf(state, attacker.entityId);
  return encounter.combatants.some((other) => {
    if (!hostileSides(other.side, attacker.side) || !isAlive(state, other.entityId)) return false;
    if (gapBetween(state, other, attacker) > 5) return false;
    // An object sees no one (docs/adr/0048-hit-points.md §5).
    if (isObjectIn(state, other.entityId)) return false;
    const vitals = vitalsOf(state, other.entityId);
    return (
      vitals !== null &&
      !incapacitated(vitals) &&
      !has(vitals, 'blinded') &&
      !(self && has(self, 'invisible'))
    );
  });
}

/** Whether an extra attack is on offer now (docs/adr/0047-weapons.md §2, §4), and its turn. */
function extraTurn(
  state: WorldState,
  encounter: EncounterState,
  attacker: CombatantRecord,
  target: CombatantRecord,
  weapon: WeaponView,
  extra: AttackExtra,
  turn: TurnState,
): TurnState | Refusal {
  const record = attacker.turn;
  if (extra === 'cleave') {
    const offer = record.cleave;
    if (
      !offer ||
      offer.attackId !== weapon.weaponId ||
      offer.targetId === target.entityId ||
      offer.movementUsedFt !== turn.movementUsedFt ||
      offer.attacksRemaining !== turn.attacksRemaining ||
      !weapon.melee
    ) {
      return refuse('NO_EXTRA_ATTACK');
    }
    // Its second target is a creature, as the first was (docs/adr/0048-hit-points.md §5).
    if (isObjectIn(state, target.entityId)) return refuse('NOT_A_CREATURE');
    const first = combatantOf(encounter, offer.targetId);
    if (!first || gapBetween(state, first, target) > 5) {
      return refuse('OUT_OF_RANGE');
    }
    return turn;
  }
  // The Light property's: a different Light weapon after the Attack action's Light one.
  const first = record.lightWeapon;
  if (first === undefined || record.offhandAttacked === true || !weapon.light) {
    return refuse('NO_EXTRA_ATTACK');
  }
  const hands = handsOf(state, attacker.entityId);
  if (hands.shield) return refuse('HANDS_FULL');
  if (weapon.weaponId === first && !(hands.main === first && hands.off === first)) {
    return refuse('NO_EXTRA_ATTACK');
  }
  // Nick makes it part of the Attack action; else it takes the Bonus Action.
  if (weapon.mastery === 'nick') return turn;
  if (turn.bonusActionUsed) return refuse('NO_BONUS_ACTION');
  return { ...turn, bonusActionUsed: true };
}

export function attackPlan(
  state: WorldState,
  encounter: EncounterState,
  attackerId: string,
  attackId: string,
  targetId: string,
  economy: AttackEconomy = 'action',
  options: AttackOptions = {},
): AttackPlan | Refusal {
  const attacker = combatantOf(encounter, attackerId);
  const target = combatantOf(encounter, targetId);
  if (!attacker) return refuse('NOT_IN_COMBAT');
  if (!target) return refuse('NOT_A_COMBATANT');
  const attackerVitals = vitalsOf(state, attackerId);
  const targetVitals = vitalsOf(state, targetId);
  if (!attackerVitals || !targetVitals) return refuse('NOT_A_COMBATANT');
  if (!isAlive(state, attackerId)) return refuse('ACTOR_DEAD');
  if (attackerId === targetId) return refuse('TARGET_REQUIRED');
  if (!isAlive(state, targetId)) return refuse('TARGET_DEAD');
  if (incapacitated(attackerVitals)) return refuse('INCAPACITATED');
  // A Charmed creature cannot attack its charmer (docs/adr/0045-conditions-and-actions.md §1).
  if (charmedBy(attacker, attackerVitals, targetId)) return refuse('CHARMED_BY_TARGET');

  const extra = options.extra ?? null;
  let turn = turnStateOf(encounter, attacker);
  if (economy === 'reaction') {
    // Off its own turn, paid with the Reaction (ADR 0046 §2, §5).
    if (extra !== null) return refuse('NO_EXTRA_ATTACK');
    if (!turn.reactionAvailable) return refuse('NO_REACTION');
    turn = { ...turn, reactionAvailable: false };
  } else if (!turn.ownTurn) {
    return refuse('NOT_YOUR_TURN');
  } else if (extra === null && turn.attacksRemaining === 0) {
    if (attackerVitals.kind === 'character') {
      const begun = beginAttackAction(attackerVitals.sheet, turn);
      if ('legal' in begun) return refuse(begun.reason);
      turn = begun;
    } else {
      if (turn.actionUsed) return refuse('NO_ACTION');
      turn = { ...turn, actionUsed: true, attacksRemaining: attackerVitals.block.attacksPerAction };
    }
  }

  // From nearest square to nearest square (docs/adr/0049-space-and-movement.md §1).
  const distanceFt = gapBetween(state, attacker, target);
  const coverLevel = coverOf(state, encounter, target);
  if (coverLevel === 'total') return refuse('TOTAL_COVER');
  const weapon = weaponOf(state, attackerVitals, attackId, distanceFt);
  if (typeof weapon === 'string') return refuse(weapon);
  if (extra !== null) {
    const paid = extraTurn(state, encounter, attacker, target, weapon, extra, turn);
    if ('legal' in paid) return paid;
    turn = paid;
  }
  // A Loading weapon fires once an action, whatever Extra Attack allows (ADR 0047 §1).
  const firesLoading = weapon.loading && economy === 'action' && extra === null;
  if (firesLoading && attacker.turn.loadingFired === true) return refuse('LOADING');
  // Under water a ranged weapon reaches its normal range only (docs/adr/0049-space-and-movement.md
  // §11): the attacker fully in deep water, or a shot into it.
  const wetAttacker = immersed(state, encounter, attacker);
  const wet = wetAttacker || (!weapon.melee && immersed(state, encounter, target));
  const limit = weapon.melee ? weapon.reachFt : wet ? weapon.normalRangeFt : weapon.longRangeFt;
  if (distanceFt > limit)
    return refuse('OUT_OF_RANGE', { moveRequiredFt: moveRequiredFt(distanceFt, limit) });
  // Counted ammunition: a shot needs a piece of its kind (ADR 0047 §5).
  let ammunitionFrom: string | null = null;
  if (weapon.ammunition !== null && !weapon.melee) {
    const stacks = ammunitionOf(state, attackerId, weapon.ammunition);
    if (stacks.length > 0) {
      const stack = stacks.find((one) => one.quantity > 0);
      if (!stack) return refuse('NO_AMMUNITION');
      ammunitionFrom = stack.itemId;
    }
  }
  const longRange = !weapon.melee && distanceFt > weapon.normalRangeFt;
  // Dodge and Help (docs/adr/0045-conditions-and-actions.md §5): a Dodge holds while the target
  // can move and act; Help is an ally's, against this target, until the helper's next turn.
  const helper = encounter.combatants.find(
    (c) =>
      c.turn.helping === targetId &&
      c.entityId !== attackerId &&
      c.side === attacker.side &&
      isAlive(state, c.entityId),
  );
  const vexed = attacker.vexing?.targetId === targetId;
  const sapped = attacker.sappedBy !== undefined;
  const circumstances = attackCircumstances({
    attackerConditions: conditionsAgainst(state, encounter, attacker, attackerVitals, targetId),
    targetConditions: conditionsOf(targetVitals),
    melee: weapon.melee,
    distanceFt,
    longRange,
    targetDodging: isDodging(target, targetVitals),
    helped: helper !== undefined,
    foeClose: !weapon.melee && foeClose(state, encounter, attacker),
    tooHeavy: weapon.tooHeavy,
    vexing: vexed,
    sapped,
    attackerSqueezed: attacker.squeezed === true,
    targetSqueezed: target.squeezed === true,
    underwater:
      (weapon.melee ? wetAttacker : wet) &&
      underwaterDisadvantage({
        melee: weapon.melee,
        weapon: weapon.weaponId ?? attackId,
        swims: speedsOf(attackerVitals).swim !== undefined,
      }),
  });
  const marked =
    attackerVitals.kind === 'character' &&
    attackerVitals.sheet.concentration?.spellId === 'hunters-mark' &&
    attackerVitals.sheet.concentration.targetId === targetId;
  const proficiency =
    attackerVitals.kind === 'character' ? proficiencyBonus(totalLevel(attackerVitals.sheet)) : 0;
  const mastery = masteryUse(weapon, extra, options, proficiency);
  // An extra attack adds no ability modifier to its damage unless it is negative (ADR 0047 §2, §4).
  const damage =
    extra === null
      ? weapon.damage
      : {
          ...weapon.damage,
          bonus: weapon.damage.bonus - weapon.abilityModifier + Math.min(weapon.abilityModifier, 0),
        };
  const lightFirst =
    economy === 'action' &&
    extra === null &&
    weapon.light &&
    weapon.weaponId !== null &&
    attacker.turn.lightWeapon === undefined;
  const marks: WeaponMarks = {
    ...(lightFirst ? { lightWeapon: weapon.weaponId } : {}),
    ...(extra === 'offhand' ? { offhandAttacked: true as const } : {}),
    ...(extra === 'cleave' ? { cleaved: true as const } : {}),
    ...(firesLoading ? { loadingFired: true as const } : {}),
  };
  return {
    legal: true,
    melee: weapon.melee,
    attacker,
    target,
    attackerVitals,
    targetVitals,
    turn,
    helpedBy: helper?.entityId ?? null,
    hidden: detailOf(attacker, 'invisible')?.hidden === true,
    // Exhaustion takes 2 per level from the attack roll (ADR 0045 §3).
    bonus: weapon.bonus + exhaustionPenalty(exhaustionOf(attackerVitals)),
    // Shield's +5 holds until the shielded creature's next turn starts (ADR 0046 §3).
    targetAc:
      armorClass(targetVitals) +
      (coverLevel === 'none' ? 0 : COVER_BONUS[coverLevel]) +
      (target.turn.shielded === true ? SHIELD_AC_BONUS : 0),
    cover: coverLevel,
    distanceFt,
    longRange,
    ...circumstances,
    damage,
    advantageDamage: weapon.advantageDamage,
    slow: mastery?.kind === 'slow',
    huntersMark: marked,
    weapon,
    extra,
    marks,
    ammunitionFrom,
    mastery,
    vexed,
    sapped,
    knockOut: weapon.melee && options.knockOut === true,
  };
}

/** Combatants a Fireball centered on `point` would affect: everyone within 20 ft, allies included, unless in total cover. */
export function fireballArea(
  state: WorldState,
  encounter: EncounterState,
  point: Square,
): CombatantRecord[] {
  // Each creature in the sphere: an object takes no part (docs/adr/0048-hit-points.md §5).
  return encounter.combatants.filter(
    (c) =>
      isAlive(state, c.entityId) &&
      !isObjectIn(state, c.entityId) &&
      squaresOf(placedOf(state, c)).some((square) =>
        withinArea(point, square, FIREBALL_RADIUS_FT),
      ) &&
      coverOf(state, encounter, c) !== 'total',
  );
}

export const isSliceSpell = (spellId: string): spellId is SpellId => spellId in SPELLS;
