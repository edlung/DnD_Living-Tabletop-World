import './ru.ts';

/** Shared presentation only; authorized projections and callbacks come from the client. */
export {
  CharacterSheetDetails,
  type CharacterSheetDetailsProps,
} from './character-sheet-details.tsx';
export { EncounterSummary, type EncounterSummaryProps } from './encounter-summary.tsx';
export { KnowledgeDetails, type KnowledgeDetailsProps } from './knowledge-details.tsx';
export { StatusPanel, type StatusPanelProps } from './status-panel.tsx';
export {
  LanguageProvider,
  registerRussian,
  russianEntry,
  translate,
  useLanguage,
  useT,
  type Language,
  type Params,
  type Translate,
} from './i18n.tsx';
export { readableLabel, readableList } from './labels.ts';
