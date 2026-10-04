/**
 * Public entry point of @ltw/rules: deterministic slice rules on SRD 5.2.1
 * (docs/adr/0011-ruleset-srd-5-2.md). Pure functions over character sheets;
 * randomness only through injected `Dice`. Rules decide legality
 * (ARCHITECTURE_INVARIANTS.md #8, #9); AI never does.
 */
export { rollDice, scriptedDice, type Dice } from './dice.ts';
export {
  SQUARE_FT,
  distanceFt,
  isGridPosition,
  moveRequiredFt,
  pathCostFt,
  type Position,
} from './grid.ts';
export {
  abilityModifier,
  multiclassCasterLevel,
  proficiencyBonus,
  savingThrowModifier,
  skillModifier,
  slotsRemaining,
  spellAttackBonus,
  spellSaveDc,
  spellSlotsFor,
  totalLevel,
} from './character-math.ts';
export {
  attackRoll,
  d20Test,
  rollDamage,
  type AttackRollResult,
  type D20Result,
  type DamageRoll,
} from './d20.ts';
export {
  DETECT_MAGIC_RADIUS_FT,
  FIREBALL_RADIUS_FT,
  MISTY_STEP_DISTANCE_FT,
  SPELLS,
  WEAPONS,
  type CastingTime,
  type Component,
  type SpellDefinition,
  type WeaponDefinition,
} from './catalog.ts';
export {
  applyMove,
  checkMove,
  effectiveSpeedFt,
  isIncapacitated,
  startTurn,
  type Illegal,
  type IllegalReason,
  type MoveCheck,
  type TurnState,
} from './turn.ts';
export { applyCast, checkCast, type CastPlan, type CastRequest } from './casting.ts';
export {
  checkCounterspell,
  resolveCounterspell,
  type CounterspellOutcome,
  type CounterspellTrigger,
} from './reactions.ts';
export {
  checkConcentrationAfterDamage,
  concentrationAfterConditions,
  concentrationSaveDc,
  type ConcentrationOutcome,
} from './concentration.ts';
export {
  beginAttackAction,
  checkWeaponAttack,
  resolveWeaponAttack,
  useAttack,
  weaponAttackBonus,
  type AttackContext,
  type AttackOutcome,
  type AttackPlan,
  type Cover,
} from './attacks.ts';
export { skillCheckPort } from './skill-check-port.ts';
export { applyHitPointChange, resolveCheck, resolveFireball, rollHealingWord } from './effects.ts';
export {
  COVER_BONUS,
  attackCircumstances,
  checkMonsterAttack,
  damageAtZero,
  initiativeOrder,
  onGround,
  rollDeathSave,
  squareDistanceFt,
  withinArea,
  type AttackCircumstances,
  type DeathSaveOutcome,
  type DeathSaves,
  type InitiativeEntry,
} from './combat.ts';
