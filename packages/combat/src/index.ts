export { createCombatEngine } from './engine.ts';
export { actionPlan, needsAid, type ActionPlan, type ActionRequest } from './actions.ts';
export { isObjectIn } from './objects.ts';
export {
  coverAt,
  encounterOf,
  gapBetween,
  isAlive,
  occupant,
  placedOf,
  turnStateOf,
} from './battlefield.ts';
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
export { hitPoints, sizeOf, vitalsOf, type Vitals } from './vitals.ts';
export { IMPROVISED, UNARMED_STRIKE } from './weapon-view.ts';
export { encounterView } from './view.ts';
export { suggestMonsterTurn } from './suggestion.ts';
export { movePlan, type MovePlan } from './movement.ts';
