/** The character builder's contracts (docs/adr/0056-characters-from-the-srd.md §2). */
export {
  ABILITY_METHODS,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  STANDARD_ARRAY,
  characterChoicesSchema,
  createCharacterCommandSchema,
  type AbilityMethod,
  type CharacterChoices,
  type ChoiceProblem,
} from './character-choices.ts';
export type {
  BackgroundOptions,
  CharacterCreatedResponse,
  CharacterOptionsResponse,
  CharacterPreviewResponse,
  ClassOptions,
  LevelAsksView,
  LevelOptionsResponse,
  LevelUpResponse,
  NamedItem,
  OptionEquipment,
  OptionPick,
  OptionTools,
  SpeciesOptions,
  SpellOption,
} from './character-options.ts';
export {
  awardExperienceRequestSchema,
  levelUpChoicesSchema,
  type AwardExperienceRequest,
  type LevelUpChoices,
} from './level-choices.ts';
