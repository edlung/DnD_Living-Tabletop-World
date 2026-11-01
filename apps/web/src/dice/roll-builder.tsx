import { DIE_SIDES, type DieSides } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { useDiceTable } from './table.tsx';

const MAX_PER_DIE = 10;
const MAX_KINDS = 4;

/** "2d6 + 1d20 + 3", as the pool reads. */
export function poolWords(pool: ReadonlyMap<DieSides, number>, modifier: number): string {
  const dice = [...pool.entries()]
    .filter(([, count]) => count > 0)
    .map(([sides, count]) => `${String(count)}d${String(sides)}`);
  if (dice.length === 0) return '';
  const tail =
    modifier === 0 ? '' : modifier > 0 ? ` + ${String(modifier)}` : ` − ${String(-modifier)}`;
  return `${dice.join(' + ')}${tail}`;
}

/**
 * A free roll (Stage 510): pick dice by pressing them (each press adds one), a modifier, and — for
 * the DM — whether players see it; the server rolls, and the dice fly for everyone who may see them.
 */
export function RollBuilder() {
  const t = useT();
  const table = useDiceTable();
  const ids = useId();
  const [pool, setPool] = useState<ReadonlyMap<DieSides, number>>(new Map());
  const [modifier, setModifier] = useState(0);
  const [hidden, setHidden] = useState(false);
  if (!table) return null;
  const kinds = [...pool.values()].filter((count) => count > 0).length;
  const change = (sides: DieSides, by: number) => {
    const next = new Map(pool);
    const count = Math.max(0, Math.min(MAX_PER_DIE, (next.get(sides) ?? 0) + by));
    if (count === 0) next.delete(sides);
    else next.set(sides, count);
    setPool(next);
  };
  const words = poolWords(pool, modifier);
  const roll = async () => {
    const dice = [...pool.entries()].map(([sides, count]) => ({ sides, count }));
    const done = await table.roll({
      kind: 'dice',
      ...(table.characterId ? { characterId: table.characterId } : {}),
      dice,
      modifier,
      ...(table.isDm && hidden ? { hidden: true } : {}),
    });
    if (done) {
      setPool(new Map());
      setModifier(0);
    }
  };
  return (
    <section className="sheet-section dice-builder" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Roll dice')}</h3>
      <ul className="dice-picker" aria-label={t('Dice to roll')}>
        {DIE_SIDES.map((sides) => {
          const count = pool.get(sides) ?? 0;
          const full = count >= MAX_PER_DIE || (count === 0 && kinds >= MAX_KINDS);
          return (
            <li key={sides} className={`dice-pick${count > 0 ? ' is-chosen' : ''}`}>
              <button
                type="button"
                className="dice-pick-add"
                disabled={full}
                aria-label={t('Add a d{sides}', { sides })}
                onClick={() => {
                  change(sides, 1);
                }}
              >
                <span className={`die-shape die-shape--d${String(sides)}`} aria-hidden="true" />
                <span className="dice-pick-name">d{sides}</span>
                {count > 0 && <span className="dice-pick-count">×{count}</span>}
              </button>
              {count > 0 && (
                <button
                  type="button"
                  className="dice-pick-less"
                  aria-label={t('One d{sides} fewer', { sides })}
                  onClick={() => {
                    change(sides, -1);
                  }}
                >
                  −
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="dice-builder-row">
        <label className="dice-modifier" htmlFor={`${ids}-modifier`}>
          <span>{t('Modifier')}</span>
          <input
            id={`${ids}-modifier`}
            type="number"
            inputMode="numeric"
            min={-30}
            max={30}
            value={modifier}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              setModifier(Number.isNaN(value) ? 0 : Math.max(-30, Math.min(30, value)));
            }}
          />
        </label>
        {table.isDm && (
          <label className="dice-hidden">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(event) => {
                setHidden(event.target.checked);
              }}
            />
            <span>{t('Hidden from the players')}</span>
          </label>
        )}
      </div>
      <p className="dice-pool" aria-live="polite">
        {words === '' ? t('Press a die to add it.') : words}
      </p>
      <div className="dice-builder-actions">
        <button
          type="button"
          className="primary-button"
          disabled={words === '' || table.busy}
          onClick={() => void roll()}
        >
          {t('Roll')}
        </button>
        <button
          type="button"
          disabled={words === '' && modifier === 0}
          onClick={() => {
            setPool(new Map());
            setModifier(0);
          }}
        >
          {t('Clear the dice')}
        </button>
      </div>
    </section>
  );
}
