import type {
  AttunedResponse,
  CommandRejected,
  HitDieSides,
  IdentifiedResponse,
  RestResult,
} from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

import { ApiError, type WorldApi } from '../api/client.ts';

/**
 * Rests as the table asks for them (Stage 530): the DM calls a rest or ends a short one; a player
 * spends a Hit Point Die; attunement and study wait for a short rest. The server's rules decide every number; the words
 * here say what it answered. A retry sends the same `requestId`, so nothing happens twice.
 */
export type RestIntent =
  | {
      readonly action: 'start';
      readonly rest: 'short' | 'long';
      /** A long rest cut short after these hours (docs/adr/0050-the-world-around.md §6). */
      readonly cutShortAfterHours?: number;
    }
  | { readonly action: 'end' }
  | {
      readonly action: 'hit-die';
      readonly characterId: string;
      readonly sides: HitDieSides;
      /** The face of the player's own die (ADR 0044 §4). */
      readonly face?: number;
    }
  | {
      /** Attunement to an item (docs/adr/0054-items-as-data.md §5): in a Short Rest, or the DM's. */
      readonly action: 'attune';
      readonly characterId: string;
      readonly itemId: string;
      readonly attuned: boolean;
      readonly liftCurse?: true;
    }
  | {
      /** An item's properties learnt (§5): in a Short Rest, a potion by a taste, or the DM's. */
      readonly action: 'identify';
      readonly characterId: string;
      readonly itemId: string;
    };

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
  attune: 'Attunement waits for a short rest, out of a fight.',
  identify: 'Studying an item waits for a short rest, out of a fight.',
};
const REFUSED: Readonly<Record<RestIntent['action'], string>> = {
  start: 'No rest now: a fight is running, or a short rest is already under way.',
  end: 'No short rest is under way.',
  'hit-die': 'No Hit Point Die can be spent now.',
  attune: 'It cannot be attuned now.',
  identify: 'It cannot be studied now.',
};

/** The World Engine's reasons an attunement is refused (`details.attunement`), in words. */
const ATTUNE_REFUSALS: Readonly<Record<string, string>> = {
  full: 'You are attuned to three items already: end one first.',
  copy: 'You are attuned to one of these already.',
  who: 'Only those the item names may attune to it.',
  curse: 'A curse holds this attunement.',
};

const call = (request: RestIntent): [string, object] => {
  switch (request.action) {
    case 'start':
      return [
        'rest',
        {
          kind: request.rest,
          ...(request.cutShortAfterHours === undefined
            ? {}
            : { cutShortAfterHours: request.cutShortAfterHours }),
        },
      ];
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
    case 'identify':
      return [
        `items/${encodeURIComponent(request.itemId)}/identify`,
        { characterId: request.characterId },
      ];
    case 'attune':
      return [
        `items/${encodeURIComponent(request.itemId)}/attune`,
        {
          characterId: request.characterId,
          attuned: request.attuned,
          ...(request.liftCurse ? { liftCurse: true } : {}),
        },
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
    const result = await api.post<
      RestResult | AttunedResponse | IdentifiedResponse | CommandRejected
    >(path, { requestId: action.requestId, ...body }, signal, true);
    switch (result.status) {
      case 'healed':
        return t('Regained {count} hit points.', { count: result.healed });
      case 'resting':
        return result.cutShortAfterHours === undefined
          ? t('The party settles for a short rest. Players can spend Hit Point Dice now.')
          : t(
              'The long rest is cut short after {hours} h: the party has a short rest instead. Players can spend Hit Point Dice now.',
              { hours: result.cutShortAfterHours },
            );
      case 'rested':
        // Those it gave nothing, and why (docs/adr/0050-the-world-around.md §5).
        return [
          t(
            'The party rests eight hours: hit points, spell slots and Hit Point Dice are restored.',
          ),
          ...(result.skipped ?? []).map(({ name }) =>
            t('{name} had a long rest less than 24 hours ago: nothing restored.', { name }),
          ),
        ].join(' ');
      case 'ended':
        return result.woke === undefined
          ? t('The short rest is over.')
          : t('The short rest is over. {names} came round.', { names: result.woke.join(', ') });
      case 'duplicate':
        return t('That was already done.');
      case 'attuned':
        return t('Attuned: its magic is yours.');
      case 'unattuned':
        return t('The attunement is ended.');
      case 'identified':
        return t('Identified: it is {name}.', { name: result.name });
      case 'rejected': {
        const reason = result.details?.['attunement'];
        const words = typeof reason === 'string' ? ATTUNE_REFUSALS[reason] : undefined;
        return t(words ?? REFUSED[action.request.action]);
      }
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
