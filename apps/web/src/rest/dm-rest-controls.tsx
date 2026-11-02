import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { useDiceTable } from '../dice/table.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';
import { restAction } from './rest-intent.ts';

/**
 * The DM's rests (Stage 530), in the Time and weather sheet: a short rest of an hour, while which
 * the players spend Hit Point Dice until the DM ends it, or a long rest of eight hours that gives
 * the whole party everything back. No rest in a fight.
 */
export function DmRestControls({
  locked,
  fighting,
  onRun,
}: {
  readonly locked: boolean;
  /** A fight is running: the world refuses a rest. */
  readonly fighting: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  // A long rest cut short after its hours (docs/adr/0050-the-world-around.md §6).
  const [hours, setHours] = useState(4);
  const open = useDiceTable()?.rest ?? null;
  const blocked = locked || fighting;
  const hint = fighting ? 'dm-rest-fighting' : undefined;
  return (
    <section className="tool-group" aria-labelledby="dm-rest-title">
      <h3 id="dm-rest-title">
        <Glyph name="dawn" />
        {t('Rest')}
      </h3>
      {open ? (
        <p className="rest-now">
          <Glyph name="hit-points" />
          <span>{t('A short rest is under way: players spend Hit Point Dice.')}</span>
        </p>
      ) : (
        <p className="muted">
          {t('A short rest takes an hour; a long rest, eight hours, restores the whole party.')}
        </p>
      )}
      {fighting && (
        <p id="dm-rest-fighting" className="muted">
          {t('No rest while a fight is running.')}
        </p>
      )}
      <div className="action-row">
        {open ? (
          <button
            type="button"
            className="primary-button"
            disabled={locked}
            onClick={() => {
              onRun(restAction({ action: 'end' }));
            }}
          >
            <Glyph name="confirm" />
            {t('End the short rest')}
          </button>
        ) : (
          <button
            type="button"
            disabled={blocked}
            aria-describedby={hint}
            onClick={() => {
              onRun(restAction({ action: 'start', rest: 'short' }));
            }}
          >
            <Glyph name="time" />
            {t('Short rest (1 hour)')}
          </button>
        )}
        <button
          type="button"
          className={open ? undefined : 'primary-button'}
          disabled={blocked}
          aria-describedby={hint}
          onClick={() => {
            onRun(restAction({ action: 'start', rest: 'long' }));
          }}
        >
          <Glyph name="night" />
          {t('Long rest (8 hours)')}
        </button>
      </div>
      {!open && (
        <details className="rest-cut-short">
          <summary>{t('The long rest was cut short')}</summary>
          <p className="muted">
            {t(
              'After an hour or more the party has a short rest instead: Hit Point Dice, no more.',
            )}
          </p>
          <div className="action-row rest-cut-row">
            <label className="rest-cut-hours" htmlFor={`${ids}-hours`}>
              {t('Hours rested')}
            </label>
            <select
              id={`${ids}-hours`}
              value={hours}
              onChange={(event) => {
                setHours(Number(event.target.value));
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={blocked}
              aria-describedby={hint}
              onClick={() => {
                onRun(restAction({ action: 'start', rest: 'long', cutShortAfterHours: hours }));
              }}
            >
              {t('Cut short after {hours} h', { hours })}
            </button>
          </div>
        </details>
      )}
    </section>
  );
}
