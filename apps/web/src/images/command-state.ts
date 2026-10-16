import type { AssetLineageResponse } from '@ltw/contracts';

import type { ImageCommand } from './lineage.ts';

/**
 * The DM's one image command at a time (docs/STAGE_330_DESIGN.md "DM controls") as a pure state
 * machine, driven by `useDmImagesState`. A command is sent (busy), answered (settling) and done
 * only once a lineage read that started after the answer arrives: the list then shows what the
 * command did, so no control comes back while it still shows the card the DM acted on (a second
 * press would be a second, perhaps paid, request). A lost answer leaves it uncertain until the DM
 * retries it — the same client command ID, so it is never made twice. Busy, settling and
 * uncertain all hold every image control, and every place shows why.
 */
export interface ImageAction {
  /** Where its result shows: an entity's panel (`details:<entityId>`) or the sheet (`sheet`). */
  readonly place: string;
  readonly command: ImageCommand;
  /** The control and its picture in words, with the entity's name: "Approve: At night of North Gate". */
  readonly subject: string;
  /** The card it was given on (its asset or request ID), or the request form (`form`). */
  readonly target: string;
  /**
   * The words once the world accepted it, from the lineage read after the answer; `elsewhere`
   * when they show away from where it was given (retried from another place), so the picture is
   * then named with its entity.
   */
  readonly success: (lineage: AssetLineageResponse, elsewhere: boolean) => string;
}

export type ImageCommandStatus = 'idle' | 'busy' | 'uncertain' | 'settling' | 'done';

export interface ImageCommandState {
  /** Counts the commands given (a retry keeps its command's): each result is handled once. */
  readonly id: number;
  readonly status: ImageCommandStatus;
  /** Where its result shows now: where it was given, or where the DM retried it. */
  readonly place: string | null;
  /** Where it was given. */
  readonly given: string | null;
  readonly subject: string | null;
  readonly target: string | null;
  /** Once answered: whether the world accepted it (a refusal keeps the DM's draft). */
  readonly accepted: boolean;
  /** Once done: what it did, or why it was refused. */
  readonly message: string | null;
  /** Once answered: how many lineage reads had started; only a later one shows the result. */
  readonly answeredAt: number;
  /** Once answered and refused: the reason, shown when the list shows the picture as it is. */
  readonly refusal: string | null;
}

export const IDLE: ImageCommandState = {
  id: 0,
  status: 'idle',
  place: null,
  given: null,
  subject: null,
  target: null,
  accepted: false,
  message: null,
  answeredAt: 0,
  refusal: null,
};

/** A command is in flight, its answer was lost, or the list does not show its result yet. */
export const isBusy = (state: ImageCommandState): boolean =>
  state.status === 'busy' || state.status === 'uncertain' || state.status === 'settling';

/** A new command is sent. */
export const sent = (
  state: ImageCommandState,
  action: Pick<ImageAction, 'place' | 'subject' | 'target'>,
): ImageCommandState => ({
  ...IDLE,
  id: state.id + 1,
  status: 'busy',
  place: action.place,
  given: action.place,
  subject: action.subject,
  target: action.target,
});

/** The uncertain command is sent again; its result then shows where Retry was pressed. */
export const retried = (state: ImageCommandState, place: string): ImageCommandState =>
  state.status === 'uncertain' ? { ...state, status: 'busy', place } : state;

/** The world answered: accepted, or refused with its reason. `readsStarted` counts lineage reads. */
export const answered = (
  state: ImageCommandState,
  answer: { readonly refusal: string | null },
  readsStarted: number,
): ImageCommandState =>
  state.status === 'busy'
    ? {
        ...state,
        status: 'settling',
        accepted: answer.refusal === null,
        refusal: answer.refusal,
        answeredAt: readsStarted,
      }
    : state;

/** The answer was lost: the change may have been made. */
export const interrupted = (state: ImageCommandState): ImageCommandState =>
  state.status === 'busy' ? { ...state, status: 'uncertain' } : state;

/**
 * A lineage read arrived (`read` numbers it in the order reads started). One that started after
 * the answer shows the command's result: the command is done, in the words of what it did.
 */
export function lineageRead(
  state: ImageCommandState,
  read: number,
  lineage: AssetLineageResponse,
  success: ImageAction['success'],
): ImageCommandState {
  if (state.status !== 'settling' || read <= state.answeredAt) return state;
  return {
    ...state,
    status: 'done',
    message: state.accepted ? success(lineage, state.place !== state.given) : state.refusal,
  };
}
