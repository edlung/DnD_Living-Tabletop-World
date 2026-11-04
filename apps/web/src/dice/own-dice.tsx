import type { Check, CheckRequestView, RollMode } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { signed } from '../character/words.ts';
import { d20sFor, failsOutright, rolledMode } from './modes.ts';
import { useDiceTable } from './table.tsx';

/**
 * One's own dice (docs/adr/0044-online-play.md §4): where the campaign's dice are the players' own
 * (the DM's always), a roll may carry the faces read off real dice instead of the app's. A field
 * per die, each taking only its die's faces; the server checks them again and computes every total.
 */
export function useOwnDice(): boolean {
  const table = useDiceTable();
  return table !== null && (table.isDm || table.physical);
}

/** The entered faces as numbers, or null while one is missing or not on its die. */
export function facesOf(dice: readonly number[], entered: readonly string[]): number[] | null {
  if (dice.length === 0) return null;
  const faces = dice.map((_, index) => Number(entered[index] ?? ''));
  return faces.every(
    (face, index) => Number.isInteger(face) && face >= 1 && face <= (dice[index] ?? 0),
  )
    ? faces
    : null;
}

export function FaceFields({
  dice,
  entered,
  onChange,
}: {
  /** Each die's number of faces, in the roll's order. */
  readonly dice: readonly number[];
  readonly entered: readonly string[];
  readonly onChange: (entered: string[]) => void;
}) {
  const t = useT();
  const ids = useId();
  return (
    <fieldset className="dice-faces">
      <legend>{t('What your dice show')}</legend>
      {dice.map((sides, index) => {
        const value = entered[index] ?? '';
        const face = Number(value);
        const wrong = value !== '' && !(Number.isInteger(face) && face >= 1 && face <= sides);
        return (
          <label key={index} className="dice-face" htmlFor={`${ids}-${String(index)}`}>
            <span>{t('Die {number}: d{sides}', { number: index + 1, sides })}</span>
            <input
              id={`${ids}-${String(index)}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={sides}
              value={value}
              aria-invalid={wrong || undefined}
              onChange={(event) => {
                const next = dice.map((_, at) => entered[at] ?? '');
                next[index] = event.target.value;
                onChange(next);
              }}
            />
          </label>
        );
      })}
    </fieldset>
  );
}

/** The d20 lookups of the viewer's character (ADR 0045 §1), once the table has read them. */
export function useD20Modes() {
  const table = useDiceTable();
  return table?.requests.status === 'ready' ? table.requests.value.d20 : undefined;
}

/**
 * What the character's conditions do to this roll, in words (docs/adr/0045-conditions-and-
 * actions.md §1, §3): a save they fail outright, the Advantage or Disadvantage they bring, and
 * Exhaustion's penalty. Nothing when they change nothing.
 */
export function ConditionsNote({
  check,
  asked,
}: {
  readonly check: Check;
  readonly asked: RollMode;
}) {
  const t = useT();
  const d20 = useD20Modes();
  if (!d20) return null;
  if (failsOutright(d20, check)) {
    return <small className="roll-note">{t('Your conditions fail this save outright.')}</small>;
  }
  const rolled = rolledMode(d20, check, asked);
  const words = [
    ...(rolled === asked
      ? []
      : [
          rolled === 'advantage'
            ? t('Your conditions give Advantage.')
            : rolled === 'disadvantage'
              ? t('Your conditions give Disadvantage.')
              : t('Your conditions cancel it out: one die.'),
        ]),
    ...(d20.penalty === 0
      ? []
      : [t('Exhaustion: {penalty} to the roll.', { penalty: signed(d20.penalty) })]),
  ];
  return words.length === 0 ? null : <small className="roll-note">{words.join(' ')}</small>;
}

/**
 * The answer to a check the DM asked (Stage 510; ADR 0044 §4): the app's Roll, and where the
 * player's own dice may be used, their d20s' faces entered — two when the roll, under the
 * character's conditions, has Advantage or Disadvantage (ADR 0045 §1).
 */
export function AnswerCheck({ request }: { readonly request: CheckRequestView }) {
  const t = useT();
  const table = useDiceTable();
  const own = useOwnDice();
  const [entering, setEntering] = useState(false);
  const [entered, setEntered] = useState<string[]>([]);
  if (!table || table.characterId === null) return null;
  const characterId = table.characterId;
  const d20 = table.requests.status === 'ready' ? table.requests.value.d20 : undefined;
  const dice = d20sFor(rolledMode(d20, request.check, request.mode));
  const faces = facesOf(dice, entered);
  const answer = (extra: { readonly faces?: number[] }) =>
    void table
      .roll({
        kind: 'check',
        characterId,
        check: request.check,
        mode: request.mode,
        requestId: request.requestId,
        ...extra,
      })
      .then((done) => {
        if (done) setEntered([]);
      });
  return (
    <span className="answer-check">
      <ConditionsNote check={request.check} asked={request.mode} />
      {entering ? (
        <>
          <FaceFields dice={dice} entered={entered} onChange={setEntered} />
          <button
            type="button"
            className="primary-button"
            disabled={faces === null || table.busy}
            onClick={() => {
              if (faces) answer({ faces });
            }}
          >
            {t('Enter the roll')}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="primary-button"
          disabled={table.busy}
          onClick={() => {
            answer({});
          }}
        >
          {t('Roll')}
        </button>
      )}
      {own && (
        <button
          type="button"
          aria-pressed={entering}
          onClick={() => {
            setEntering(!entering);
          }}
        >
          {t('My own dice')}
        </button>
      )}
    </span>
  );
}
