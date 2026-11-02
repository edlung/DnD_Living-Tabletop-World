import type { CheckRequestView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

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

/**
 * The answer to a check the DM asked (Stage 510; ADR 0044 §4): the app's Roll, and where the
 * player's own dice may be used, their d20s' faces (two with Advantage or Disadvantage) entered.
 */
export function AnswerCheck({ request }: { readonly request: CheckRequestView }) {
  const t = useT();
  const table = useDiceTable();
  const own = useOwnDice();
  const [entering, setEntering] = useState(false);
  const [entered, setEntered] = useState<string[]>([]);
  if (!table || table.characterId === null) return null;
  const characterId = table.characterId;
  const dice = request.mode === 'normal' ? [20] : [20, 20];
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
