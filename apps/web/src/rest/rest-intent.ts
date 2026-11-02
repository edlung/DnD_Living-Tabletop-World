import type { ClassId, HitDieSides, RestResult } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

import { ApiError, type WorldApi } from '../api/client.ts';

/**
 * Rests and levels as the table asks for them (Stage 530): the DM calls a rest, ends a short one or
 * grants a level; a player spends a Hit Point Die. The server's rules decide every number; the words
 * here say what it answered. A retry sends the same `requestId`, so nothing happens twice.
 */
export type RestIntent =
  | { readonly action: 'start'; readonly rest: 'short' | 'long' }
  | { readonly action: 'end' }
  | {
      readonly action: 'hit-die';
      readonly characterId: string;
      readonly sides: HitDieSides;
      /** The face of the player's own die (ADR 0044 §4). */
      readonly face?: number;
    }
  | { readonly action: 'level-up'; readonly characterId: string; readonly classId: ClassId };

export interface RestAction {
  readonly kind: 'rest';
  readonly request: RestIntent;
  readonly requestId: string;
}

export const restAction = (request: RestIntent): RestAction => ({
  kind: 'rest',
  request,
  requestId: crypto.randomUUID(),
});

const CONFLICT: Readonly<Record<RestIntent['action'], string>> = {
  start: 'No rest now: a fight is running, or a short rest is already under way.',
  end: 'No short rest is under way.',
  'hit-die': 'The short rest is over, or a fight began.',
  'level-up': 'The level could not be granted. Try again.',
};
const REFUSED: Readonly<Record<RestIntent['action'], string>> = {
  start: 'No rest now: a fight is running, or a short rest is already under way.',
  end: 'No short rest is under way.',
  'hit-die': 'No Hit Point Die can be spent now.',
  'level-up': 'That level cannot be granted.',
};

const call = (request: RestIntent): [string, object] => {
  switch (request.action) {
    case 'start':
      return ['rest', { kind: request.rest }];
    case 'end':
      return ['rest/end', {}];
    case 'hit-die':
      return [
        'rest/hit-die',
        {
          characterId: request.characterId,
          sides: request.sides,
          ...(request.face === undefined ? {} : { face: request.face }),
        },
      ];
    case 'level-up':
      return [
        `characters/${encodeURIComponent(request.characterId)}/level-up`,
        { classId: request.classId },
      ];
  }
};

/** Sends the request and words the answer; a lost answer throws, so the same attempt retries. */
export async function runRest(
  api: WorldApi,
  action: RestAction,
  signal: AbortSignal,
  t: Translate,
): Promise<string> {
  const [path, body] = call(action.request);
  try {
    const result = await api.post<RestResult>(
      path,
      { requestId: action.requestId, ...body },
      signal,
      true,
    );
    switch (result.status) {
      case 'healed':
        return t('Regained {count} hit points.', { count: result.healed });
      case 'resting':
        return t('The party settles for a short rest. Players can spend Hit Point Dice now.');
      case 'rested':
        return t(
          'The party rests eight hours: hit points, spell slots and Hit Point Dice are restored.',
        );
      case 'ended':
        return t('The short rest is over.');
      case 'levelled':
        return t('A new level is granted.');
      case 'duplicate':
        return t('That was already done.');
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return t(CONFLICT[action.request.action]);
    }
    if (error instanceof ApiError && error.status === 422) {
      return t(REFUSED[action.request.action]);
    }
    throw error;
  }
}
