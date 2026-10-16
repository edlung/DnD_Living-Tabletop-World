import type { AssetFailure, AssetRequestStatus } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

import type { ImageKind, RequestChoice } from './lineage.ts';

/**
 * The words of the DM's image controls (docs/STAGE_330_DESIGN.md "DM controls"). Every sentence
 * is an English key the client dictionary translates (`i18n/ru-images.ts`); a label the
 * dictionary does not know is shown as the DM's label itself.
 */
const STATE_WORDS: Readonly<Record<string, string>> = {
  night: 'At night',
  dawn: 'At dawn',
  dusk: 'At dusk',
  rain: 'In the rain',
  storm: 'In a storm',
  fog: 'In fog',
  snow: 'In snow',
  overcast: 'Under an overcast sky',
  'night-rain': 'At night in the rain',
  wounded: 'Wounded',
  unconscious: 'Unconscious',
  dead: 'Dead',
  destroyed: 'Destroyed',
};

/** A state a derived image is chosen for, in words. */
export const stateWords = (t: Translate, label: string): string => {
  const words = STATE_WORDS[label];
  return words === undefined ? label : t(words);
};

/**
 * What a picture is, in words: the main picture, the state a variant is shown in ("At night"),
 * a figure, a battle map. A variant whose label names no state the client knows keeps the label.
 */
export function kindWords(t: Translate, kind: ImageKind): string {
  if (kind.purpose === 'figure') return t('Figure for the battlefield');
  if (kind.purpose === 'battle-map') return t('Battle map');
  if (kind.variant === 'reference') return t('Main picture');
  const label = kind.label ?? '';
  return STATE_WORDS[label] === undefined ? t('Variant: {label}', { label }) : stateWords(t, label);
}

export const CHOICE_WORDS: Readonly<Record<RequestChoice, string>> = {
  reference: 'The main picture',
  variant: 'A variant for a state',
  figure: 'A figure for the battlefield',
  'battle-map': 'A battle map seen from above',
};

/**
 * Why a job made no picture, as the lineage records it (ADR 0035 Amendments): the fixed
 * reasons only, never a provider's text.
 */
export const FAILURE_WORDS: Readonly<Record<AssetFailure, string>> = {
  REFUSED: 'The image model refused this request.',
  TIMEOUT: 'The image model did not answer in time.',
  PROVIDER_ERROR: 'The image service failed.',
  UNAVAILABLE:
    'No picture could be made: no image budget is available, or there is nothing to work from.',
};

/** Where a request stands while no picture exists yet; no progress is ever invented. */
export const JOB_WORDS: Readonly<Partial<Record<AssetRequestStatus, string>>> = {
  QUEUED: 'Waiting for the image generator',
  STARTED: 'Being generated',
};

/** Who made a picture, as its asset records the generator (DM information). */
export function makerWords(t: Translate, generator: { readonly provider: string }): string {
  switch (generator.provider) {
    case 'curated':
      return t('Curated set');
    case 'openrouter-openai':
      return t('OpenAI image model');
    case 'local':
      return t('Placeholder generator (tests and offline use)');
    default:
      return generator.provider;
  }
}
