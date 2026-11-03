import type {
  CharacterSheet,
  MetamagicChoice,
  Square,
  SrdSpellMechanics,
  SummonChoice,
} from '@ltw/contracts';
import {
  deadForSeconds,
  combatantOf,
  perceivedEntityIds,
  type CombatantRecord,
  type EncounterState,
  type WorldState,
} from '@ltw/domain';
import {
  applyCast,
  atWillOnSelf,
  cantripTier,
  checkCast,
  gapToSquareFt,
  inSpellArea,
  metamagicRefusal,
  spellRules,
  squaresOf,
  startTurn,
  totalLevel,
  type CastPlan,
  type SpellRules,
  type TurnState,
} from '@ltw/rules';

import { canSee } from './sight.ts';
import { coverAt, gapBetween, inBounds, isAlive, placedOf, turnStateOf } from './battlefield.ts';
import { charmedBy } from './condition-details.ts';
import type { CombatReason, Refusal } from './legality.ts';
import { isObjectIn } from './objects.ts';
import {
  chooseUsing,
  refunded,
  type Economy,
  type TargetInfo,
  type Using,
} from './spell-legality.ts';
import { summonPlan, type PlacedSummon } from './summons.ts';
import { incapacitated, vitalsOf } from './vitals.ts';

/**
 * A spell cast from its data (docs/adr/0052-spells-as-data.md §5): the caster knows it, a slot of
 * its level or higher (none for a cantrip), the turn's economy, each target in range and in sight
 * where the spell asks, its area on the board. In a fight with real distances; outside it, as at
 * the start of a turn, among the creatures the caster perceives (ADR 0012).
 */
export interface DataSpellPlan {
  readonly legal: true;
  readonly spellId: string;
  readonly rules: SpellRules;
  readonly mechanics: SrdSpellMechanics;
  readonly cast: CastPlan;
  /** The caster's sheet and turn after paying for the spell. */
  readonly sheet: CharacterSheet;
  readonly turn: TurnState;
  readonly record: CombatantRecord | null;
  /** Slot levels above the spell's own: what a higher slot adds (§3). */
  readonly above: number;
  /** A cantrip's tier at the caster's level (§3): 1 to 4. */
  readonly tier: number;
  /** One per attack, dart or creature it names; an attack's or a dart's target may repeat. */
  readonly targets: readonly TargetInfo[];
  /** The creatures in its area. */
  readonly area: readonly CombatantRecord[];
  readonly point: Square | null;
  /** The Metamagic spent on it; null for none. */
  readonly metamagic: MetamagicChoice | null;
  /** What a summoning spell calls up, and where (docs/adr/0056-characters-from-the-srd.md §5). */
  readonly summons: readonly PlacedSummon[];
}

export interface DataSpellRequest {
  readonly spellId: string;
  readonly using?: Using;
  readonly targetIds?: readonly string[];
  readonly point?: Square;
  /** A Sorcerer's Metamagic (docs/adr/0056-characters-from-the-srd.md §4). */
  readonly metamagic?: MetamagicChoice;
  /** A summoning spell's choice (§5). */
  readonly summon?: SummonChoice;
}

const refuse = (reason: CombatReason, resolution?: Refusal['resolution']): Refusal =>
  resolution ? { legal: false, reason, resolution } : { legal: false, reason };

/** How many targets the spell takes at this slot and level: attacks and darts each name one. */
export function targetCount(mechanics: SrdSpellMechanics, above: number, tier: number): number {
  const { effect, upcast } = mechanics;
  if (effect.kind === 'auto') return effect.darts + (upcast?.darts ?? 0) * above;
  if (mechanics.cantrip === 'beams') return tier;
  return (mechanics.targets ?? 1) + (upcast?.targets ?? 0) * above;
}

export function dataSpellPlan(
  state: WorldState,
  casterId: string,
  request: DataSpellRequest,
  refund?: Economy,
): DataSpellPlan | Refusal {
  const caster = vitalsOf(state, casterId);
  if (caster?.kind !== 'character') return refuse('NOT_A_COMBATANT');
  if (!isAlive(state, casterId)) return refuse('ACTOR_DEAD');
  const rules = spellRules(request.spellId);
  const mechanics = rules?.mechanics;
  if (!rules || !mechanics) return refuse('NOT_KNOWN');
  const encounter = state.encounter;
  const record = encounter ? (combatantOf(encounter, casterId) ?? null) : null;
  const turn = refunded(
    encounter && record ? turnStateOf(encounter, record) : startTurn(true),
    refund,
  );
  const using = request.using ?? chooseUsing(caster.sheet, request.spellId);
  const castLevel =
    rules.level === 0 || using === 'free' || using === 'ritual' ? rules.level : using.slotLevel;
  const above = Math.max(0, castLevel - rules.level);
  const tier = cantripTier(totalLevel(caster.sheet));
  const { effect, area: shape } = mechanics;
  const fighting = encounter !== null && record !== null;
  const harmful = effect.kind === 'attack' || effect.kind === 'save' || effect.kind === 'auto';
  // Harm and areas need the fight's board, as Fireball does (ADR 0015 §3).
  if (!fighting && (harmful || (shape !== null && effect.kind !== 'dm')))
    return refuse('NOT_IN_COMBAT');

  let point: Square | null = null;
  let area: CombatantRecord[] = [];
  let farthest = 0;
  if (shape && fighting && effect.kind !== 'dm') {
    const needsPoint = shape.shape !== 'emanation';
    if (needsPoint && request.point === undefined) return refuse('TARGET_REQUIRED');
    if (request.point !== undefined) {
      if (!inBounds(encounter, request.point)) return refuse('DESTINATION_INVALID');
      point = request.point;
      if (shape.origin === 'point') farthest = gapToSquareFt(placedOf(state, record), point);
    }
    area = creaturesInArea(state, encounter, record, mechanics, point);
  }

  // The creatures it names: the caster itself for a spell on oneself.
  const named =
    request.targetIds ??
    (rules.range === 'self' && !shape && effect.kind !== 'dm' ? [casterId] : []);
  // Metamagic the Sorcerer knows and can pay for, before what it does to this spell (§4).
  const metamagicFails = request.metamagic
    ? metamagicRefusal(caster.sheet, request.metamagic.options)
    : null;
  if (metamagicFails) return refuse(metamagicFails);
  // Twinned Spell: the effective level one higher, for a spell whose higher level names another.
  const twinned = request.metamagic?.options.includes('twinned-spell') === true;
  if (twinned && !(mechanics.upcast?.targets && mechanics.upcast.targets > 0))
    return refuse('NOT_FOR_THIS_SPELL');
  const count = targetCount(mechanics, above + (twinned ? 1 : 0), tier);
  const repeats = effect.kind === 'attack' || effect.kind === 'auto';
  const takesTargets =
    effect.kind !== 'dm' &&
    effect.kind !== 'summon' &&
    (!shape || effect.kind === 'heal' || effect.kind === 'temp-hp');
  if (takesTargets && named.length === 0) return refuse('TARGET_REQUIRED');
  if (named.length > count || (!repeats && new Set(named).size !== named.length))
    return refuse('TOO_MANY_TARGETS');
  const targets: TargetInfo[] = [];
  let seen = true;
  for (const targetId of named) {
    const located = locate(
      state,
      encounter,
      record,
      casterId,
      targetId,
      effect.kind === 'revive' ? effect.withinSeconds : null,
    );
    if ('legal' in located) return located;
    // Healing in an area reaches only those in it (Mass Cure Wounds' sphere).
    if (shape && fighting && !area.some((one) => one.entityId === targetId))
      return refuse('OUT_OF_RANGE');
    farthest = Math.max(farthest, located.distanceFt);
    if (encounter && record && located.target.record && targetId !== casterId)
      seen &&= canSee(state, encounter, record, located.target.record);
    targets.push(located.target);
  }

  if (incapacitated(caster)) return refuse('INCAPACITATED');
  if (record && harmful && targets.some((one) => charmedBy(record, caster, one.entityId)))
    return refuse('CHARMED_BY_TARGET');
  const cast = checkCast(caster.sheet, turn, {
    spellId: request.spellId,
    using,
    inFight: fighting,
    ...(request.metamagic ? { metamagic: request.metamagic.options } : {}),
    ...(rules.range === 'self' && targets.every((one) => one.entityId === casterId)
      ? {}
      : { target: { distanceFt: farthest, visible: seen } }),
  });
  if (!cast.legal) return refuse(cast.reason, cast.resolution);
  // An invocation's spell cast at will on the Warlock alone (docs/adr/0056-…md §4).
  if (
    cast.atWill &&
    atWillOnSelf(caster.sheet, request.spellId) &&
    targets.some((one) => one.entityId !== casterId)
  )
    return refuse('SELF_ONLY');
  if (!record && encounter && targets.some((one) => combatantOf(encounter, one.entityId)))
    return refuse('TARGET_IN_COMBAT');
  // A summoning spell's creatures, and their places in the fight (§5).
  const summons =
    effect.kind === 'summon'
      ? summonPlan(
          state,
          { entityId: casterId, record: fighting ? record : null },
          {
            spellId: request.spellId,
            creature: effect.creature,
            rangeFt: mechanics.range.kind === 'feet' ? mechanics.range.amount : null,
            level: castLevel,
          },
          cast,
          caster.sheet.abilities,
          request.summon,
          request.point ?? null,
        )
      : [];
  if ('legal' in summons) return summons;
  const applied = applyCast(caster.sheet, turn, cast);
  // Extended Spell: Advantage on saves to keep its Concentration (§4).
  const extended =
    request.metamagic?.options.includes('extended-spell') === true &&
    applied.sheet.concentration?.spellId === request.spellId;
  const after = extended
    ? {
        ...applied,
        sheet: {
          ...applied.sheet,
          concentration: { spellId: request.spellId, extended: true as const },
        },
      }
    : applied;
  return {
    legal: true,
    spellId: request.spellId,
    rules,
    mechanics,
    cast,
    sheet: after.sheet,
    turn: after.turn,
    record,
    above,
    tier,
    targets,
    area,
    point,
    metamagic: request.metamagic ?? null,
    summons,
  };
}

function creaturesInArea(
  state: WorldState,
  encounter: EncounterState,
  caster: CombatantRecord,
  mechanics: SrdSpellMechanics,
  point: Square | null,
): CombatantRecord[] {
  const shape = mechanics.area;
  if (!shape) return [];
  const own = squaresOf(placedOf(state, caster));
  return encounter.combatants.filter(
    (one) =>
      isAlive(state, one.entityId) &&
      !isObjectIn(state, one.entityId) &&
      coverAt(encounter, one.position) !== 'total' &&
      squaresOf(placedOf(state, one)).some((square) => inSpellArea(shape, own, point, square)),
  );
}

/**
 * Whether the target is one the spell may name: alive, or for a spell that returns the dead
 * (`deadWithin`, docs/adr/0056-characters-from-the-srd.md §5) dead no longer than it reaches.
 */
function lifeRefusal(
  state: WorldState,
  targetId: string,
  deadWithin: number | null,
): Refusal | null {
  if (deadWithin === null) return isAlive(state, targetId) ? null : refuse('TARGET_DEAD');
  const dead = deadForSeconds(state, targetId);
  if (dead === null) return refuse('NOT_DEAD');
  return dead > deadWithin ? refuse('DEAD_TOO_LONG') : null;
}

function locate(
  state: WorldState,
  encounter: EncounterState | null,
  record: CombatantRecord | null,
  casterId: string,
  targetId: string,
  deadWithin: number | null,
): { target: TargetInfo; distanceFt: number } | Refusal {
  if (encounter && record) {
    const targetRecord = combatantOf(encounter, targetId);
    if (!targetRecord) return refuse('NOT_A_COMBATANT');
    const life = lifeRefusal(state, targetId, deadWithin);
    if (life) return life;
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
      distanceFt: targetId === casterId ? 0 : gapBetween(state, record, targetRecord),
    };
  }
  if (targetId !== casterId && !perceivedEntityIds(state, casterId).has(targetId))
    return refuse('TARGET_NOT_VISIBLE');
  const life = lifeRefusal(state, targetId, deadWithin);
  if (life) return life;
  return {
    target: { entityId: targetId, vitals: vitalsOf(state, targetId), record: null, cover: 'none' },
    distanceFt: 0,
  };
}
