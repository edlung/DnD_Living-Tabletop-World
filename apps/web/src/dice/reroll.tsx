import type { RollEntry } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { FaceFields, facesOf, useOwnDice } from './own-dice.tsx';
import { useDiceTable } from './table.tsx';

/**
 * Heroic Inspiration on one's latest check (docs/adr/0046-reactions-beyond-counterspell.md §6),
 * under that roll in the log: its lower d20 rolled again by the app, or read off one's own die
 * where the dice are the players' (ADR 0044 §4). The new roll counts; the first stays, marked.
 * The server says which roll may be rolled again; the button is only there for it.
 */
export function RerollCheck({ entry }: { readonly entry: RollEntry }) {
  const t = useT();
  const table = useDiceTable();
  const own = useOwnDice();
  const ids = useId();
  const [entering, setEntering] = useState(false);
  const [entered, setEntered] = useState<string[]>([]);
  if (!table) return null;
  const d20s = (entry.groups[0]?.dice ?? []).map((die) => die.value);
  const faces = facesOf([20], entered);
  const again = (body: { readonly faces?: number[] }) =>
    void table.reroll(entry.rollId, body).then((done) => {
      if (done) setEntered([]);
    });
  return (
    <div className="dice-reroll" role="group" aria-labelledby={`${ids}-what`}>
      <p className="dice-reroll-what" id={`${ids}-what`}>
        {d20s.length === 2
          ? t('Heroic Inspiration: roll the lower d20 ({face}) again. The new roll counts.', {
              face: Math.min(...d20s),
            })
          : t('Heroic Inspiration: roll the d20 again. The new roll counts.')}
      </p>
      {entering && <FaceFields dice={[20]} entered={entered} onChange={setEntered} />}
      <span className="dice-reroll-actions">
        <button
          type="button"
          className="primary-button"
          disabled={table.busy || (entering && faces === null)}
          onClick={() => {
            if (!entering) again({});
            else if (faces) again({ faces });
          }}
        >
          {entering ? t('Enter the roll') : t('Roll again')}
        </button>
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
    </div>
  );
}
