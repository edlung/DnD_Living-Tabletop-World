import type { AssetFailure, AssetRequestStatus } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

import type { ImageCommandState } from './command-state.ts';
import type { ApprovalStanding, ImageKind, RequestChoice } from './lineage.ts';

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

/** When a state picture is shown, as the end of a sentence ("… at night", "… while wounded"). */
const WHEN_WORDS: Readonly<Record<string, string>> = {
  night: 'at night',
  dawn: 'at dawn',
  dusk: 'at dusk',
  rain: 'in the rain',
  storm: 'in a storm',
  fog: 'in fog',
  snow: 'in snow',
  overcast: 'under an overcast sky',
  'night-rain': 'at night in the rain',
  wounded: 'while wounded',
  unconscious: 'while unconscious',
  dead: 'once dead',
  destroyed: 'once destroyed',
};

export const whenWords = (t: Translate, label: string): string => {
  const words = WHEN_WORDS[label];
  return words === undefined ? t('when its state is “{label}”', { label }) : t(words);
};

/**
 * What an approval did, from the lineage read after it (`approvalStanding`), never claiming more:
 * the main picture, a figure and a battle map are what players who can see the entity now see
 * (a battle map under a fight there; state pictures keep their states); a state picture is shown
 * only in its state; a picture the DM alone may see, or one that is not the shown one of its kind
 * any more, says so.
 */
export function approvalWords(
  t: Translate,
  standing: ApprovalStanding,
  subject: string,
  name: string,
): string {
  switch (standing.kind) {
    case 'not-shown':
      return t(
        'Approved: {subject}. It is not the picture players see now; the list shows the one they see.',
        { subject },
      );
    case 'dm-only':
      return t('Approved: {subject}. Only you see it: it was asked for the DM alone.', { subject });
    case 'main':
      return standing.states
        ? t(
            'Approved: {subject}. Players who can see {name} now see this picture, except in a state with its own approved picture.',
            { subject, name },
          )
        : t('Approved: {subject}. Players who can see {name} now see this picture.', {
            subject,
            name,
          });
    case 'figure':
      return t('Approved: {subject}. Players who can see {name} now see this picture.', {
        subject,
        name,
      });
    case 'battle-map':
      return t(
        'Approved: {subject}. Players who can see {name} see this map under the grid of a fight there.',
        { subject, name },
      );
    case 'state': {
      const when = whenWords(t, standing.label);
      return standing.others
        ? t(
            'Approved: {subject}. Shown to players who can see {name} {when}, unless another approved state picture fits better.',
            { subject, name, when },
          )
        : t('Approved: {subject}. Shown to players who can see {name} {when}.', {
            subject,
            name,
            when,
          });
    }
  }
}

/**
 * Where the DM's image command stands, in words: being sent, its result being read, its answer
 * lost (Retry checks it), or what it did. The same words show where it was given and, while it
 * holds every image control, wherever else the DM looks.
 */
export function commandWords(t: Translate, command: ImageCommandState): string {
  const subject = command.subject ?? '';
  switch (command.status) {
    case 'busy':
      return t('Sending “{subject}”…', { subject });
    case 'settling':
      return t('Reading the result of “{subject}”…', { subject });
    case 'uncertain':
      return t(
        'The answer to “{subject}” was interrupted. The change may have been made. Retry to check it.',
        { subject },
      );
    case 'done':
      return command.message ?? '';
    case 'idle':
      return '';
  }
}
