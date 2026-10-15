import { DEFAULT_LANGUAGE, type Language } from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';

export { sayIn, russianSentence, type Say } from './say.ts';
import './authoring-ru.ts';
export { chronicleText, type ChronicleText } from './chronicle-text.ts';
export { contradictionText, type ContradictionText } from './contradiction-text.ts';
export { investigationText, type InvestigationText } from './investigation-text.ts';

/** The campaign's play language (docs/adr/0031-play-language.md); English before one exists. */
export const languageOf = (state: Pick<WorldState, 'campaign'>): Language =>
  state.campaign?.language ?? DEFAULT_LANGUAGE;
