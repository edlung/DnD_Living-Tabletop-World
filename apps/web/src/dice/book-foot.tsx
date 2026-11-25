import { DIE_SIDES, type DieSides } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState } from 'react';

import { diePicture, dieStyle, useBookTheme } from '../book-kit/materials.ts';
import type { Shell } from '../shell/use-shell.ts';
import { useDiceTable } from './table.tsx';
import { rollerWords } from './words.ts';

/**
 * The dice at the foot of every page (docs/adr/0075-book-interface.md §8): one press rolls one die
 * for the table, the server rolls it and the dice fly for everyone who may see them, as a free roll
 * of the Dice page does; the last roll the table saw stands beside them, and "More dice" opens the
 * Dice page for a pool, a modifier, a check or one's own dice. A fight has its turn tray instead.
 */
export function BookFoot({ shell }: { readonly shell: Shell }) {
  const t = useT();
  const table = useDiceTable();
  const [rolling, setRolling] = useState(false);
  // A book with dice of its own shows each die as its picture (ADR 0075 §24).
  const theme = useBookTheme();
  if (!table) return null;
  const roll = async (sides: DieSides) => {
    setRolling(true);
    try {
      await table.roll({
        kind: 'dice',
        ...(table.characterId ? { characterId: table.characterId } : {}),
        dice: [{ count: 1, sides }],
        modifier: 0,
      });
    } finally {
      setRolling(false);
    }
  };
  const rolls = table.feed.status === 'ready' ? table.feed.value.rolls : [];
  const last = [...rolls]
    .reverse()
    .find((entry) => !table.flying.has(entry.rollId) && !entry.rerolled);
  const total = last?.groups.at(-1)?.total;
  return (
    <footer
      className="book-foot"
      role="group"
      aria-label={t('The dice at the foot of the page')}
      data-drawn={diePicture(theme, 20) ? '' : undefined}
    >
      <span className="book-foot-word" aria-hidden="true">
        {t('Dice')}
      </span>
      <ul className="book-foot-dice">
        {DIE_SIDES.map((sides) => (
          <li key={sides} data-sides={sides} style={dieStyle(theme, sides)}>
            <button
              type="button"
              className="book-die"
              disabled={rolling}
              aria-label={t('Roll a d{sides} for the table', { sides: String(sides) })}
              onClick={() => {
                void roll(sides);
              }}
            >
              d{sides}
            </button>
          </li>
        ))}
      </ul>
      <p className="book-foot-last" aria-live="polite">
        {last && total !== undefined ? (
          <>
            <span className="book-foot-who">{rollerWords(t, last.roller)}</span>
            <strong>{total}</strong>
          </>
        ) : (
          <span className="book-foot-who">{t('No dice yet')}</span>
        )}
      </p>
      <button
        type="button"
        className="book-foot-more"
        onClick={() => {
          shell.openSheet('dice');
        }}
      >
        {t('More dice')}
      </button>
    </footer>
  );
}
