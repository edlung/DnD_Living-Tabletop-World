export { createCombatEngine } from './engine.ts';
export { actionPlan, type ActionPlan, type ActionRequest } from './actions.ts';
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
export {
  counterspellCandidates,
  counterspellPlan,
  type CounterspellPlan,
} from './reactions/eligibility.ts';
export { reactionWindowViolations } from './reactions/invariants.ts';
export { hitPoints, vitalsOf, type Vitals } from './vitals.ts';
export { encounterView } from './view.ts';
export { suggestMonsterTurn } from './suggestion.ts';
export { movePlan, type MovePlan } from './movement.ts';
