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
export { carryingCapacityLb, deriveCharacter, weaponAttack } from './character-derived.ts';
export {
  attackerTilt,
  checkEffects,
  conditionBlocked,
  d20Modes,
  damageAfterDefenses,
  type DamageDefenses,
  exhaustionPenalty,
  incapacitatedBy,
  initiativeEffects,
  modeAfter,
  saveEffects,
  speedAfterConditions,
  targetTilt,
  type RollEffects,
} from './conditions.ts';
export {
  CLASS_HIT_DIE,
  attacksFor,
  hitDice,
  hitDieRefusal,
  levelUp,
  longRest,
  longRestRefusal,
  wakeAfterShortRest,
  DAY_SECONDS,
  spendHitDie,
  type HitDicePool,
  type HitDieRefusal,
  type LevelUpRefusal,
} from './rest.ts';
export { OBJECT_ARMOR_CLASS, OBJECT_HIT_POINTS, objectStatBlock } from './objects.ts';
export { lightSeen, obscurementSeen, perceivesWithin, type Obscurement } from './sight.ts';
export { ARMOR_SLOW_FT, armorHampersStealth, armorSlowFt } from './armor.ts';
export {
  RUN_UP_FT,
  fallDice,
  heightFt,
  highJumpFt,
  longJumpFt,
  underwaterDisadvantage,
} from './moving.ts';
export {
  fills,
  gapFt,
  gapToSquareFt,
  sizeRank,
  smallerSize,
  spanOf,
  spanOfSize,
  squaresOf,
  type Placed,
} from './space.ts';
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
  SHIELD_AC_BONUS,
  HELLISH_REBUKE_DICE,
  FEATHER_FALL,
  hasUncannyDodge,
  hasProperty,
  WEAPONS,
  type CastingTime,
  type Component,
  type SpellDefinition,
  type WeaponDefinition,
  type WeaponProperty,
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
  weaponModifier,
  type AttackContext,
  type AttackOutcome,
  type AttackPlan,
  type Cover,
} from './attacks.ts';
export { masteryCount, masteryOf, weaponMasteriesOf } from './masteries.ts';
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
export {
  SRD_EQUIPMENT,
  SRD_MAGIC_ITEMS,
  SRD_MONSTERS,
  SRD_MONSTER_BLOCKS,
  SRD_SPELLS,
  SRD_SPELL_MECHANICS,
  srdEquipment,
  srdMagicItem,
  srdMonster,
  srdMonsterBlock,
  srdSpell,
  srdSpellMechanics,
  type SrdMonsterBlock,
} from './srd/catalog.ts';
export {
  SRD_ABBREVIATIONS,
  SRD_GLOSSARY,
  SRD_RULES_SECTIONS,
  srdGlossaryEntry,
  srdRulesSection,
} from './srd/reference.ts';
export {
  FAR_FT,
  cantripTier,
  isSliceSpell as isSliceSpellId,
  spellRules,
  type SpellRules,
} from './spell-rules.ts';
export { inSpellArea, type SpellArea } from './areas.ts';
export {
  DIFFICULTY_RATINGS,
  encounterDifficulty,
  type DifficultyRating,
  type EncounterDifficulty,
} from './difficulty.ts';
export { TRAPS, trapRules, type TrapDice, type TrapRules, type TrapTier } from './toolbox/traps.ts';
export { CONTAGIONS, contagionRules, type ContagionRules } from './toolbox/contagions.ts';
export {
  abbreviationStrings,
  englishHash,
  glossaryEntryStrings,
  rulesSectionStrings,
  russianAbbreviations,
  russianGlossaryEntry,
  russianRulesSection,
  translationProblem,
  type KeptRussian,
  type Strings,
} from './srd/russian.ts';
export {
  abbreviationsIn,
  glossaryEntryIn,
  rulesSectionIn,
  type InLanguage,
  type ReferenceLanguage,
} from './srd/reference-ru.ts';
export { equipmentIn, magicItemIn, monsterIn, spellIn } from './srd/catalogs-ru.ts';
export { SRD_CLASSES, srdClass } from './srd/classes.ts';
export {
  SRD_BACKGROUNDS,
  SRD_FEATS,
  SRD_SPECIES,
  srdBackground,
  srdFeat,
  srdSpecies,
} from './srd/origins.ts';
export { buildCharacter, type BuildResult } from './builder/build.ts';
export { rolledScores } from './builder/abilities.ts';
export { speciesGains, speciesOptions, type SpeciesGains } from './builder/species.ts';
export {
  CASTING_ABILITY,
  classCasting,
  classSpellList,
  type ClassCasting,
} from './builder/spells.ts';
export { startingEquipment, type StartingItem } from './builder/equipment.ts';
