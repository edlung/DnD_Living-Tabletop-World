export { createCombatEngine } from './engine.ts';
export { coverAt, encounterOf, isAlive, occupant, turnStateOf } from './battlefield.ts';
export {
  attackPlan,
  fireballArea,
  isSliceSpell,
  type AttackPlan,
  type CombatReason,
  type Refusal,
} from './legality.ts';
export {
  chooseUsing,
  characterSpellPlan,
  type CharacterSpellPlan,
  type Using,
} from './spell-legality.ts';
export { hitPoints, vitalsOf, type Vitals } from './vitals.ts';
export { encounterView } from './view.ts';
