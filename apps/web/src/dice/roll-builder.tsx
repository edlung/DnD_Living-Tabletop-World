import { DIE_SIDES, type DieSides, type EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { FaceFields, facesOf, useOwnDice } from './own-dice.tsx';
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
 * A free roll (Stage 510): pick dice by pressing them (each press adds one), a modifier, and who
 * sees it — the table, or the DM alone (a player), or the DM alone or one player with the DM (the
 * DM; ADR 0044 §4). The server rolls, and the dice fly for everyone who may see them; or, where
 * one's own dice may be used, their faces are entered and the server adds them up.
 */
export function RollBuilder({ characters }: { readonly characters: readonly EntityRef[] }) {
  const t = useT();
  const table = useDiceTable();
  const own = useOwnDice();
  const ids = useId();
  const [pool, setPool] = useState<ReadonlyMap<DieSides, number>>(new Map());
  const [modifier, setModifier] = useState(0);
  const [audience, setAudience] = useState('table');
  const [entering, setEntering] = useState(false);
  const [entered, setEntered] = useState<string[]>([]);
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
  // Each die in the order the roll names them: the faces entered follow it.
  const order = [...pool.entries()].flatMap(([sides, count]) =>
    Array.from({ length: count }, () => sides),
  );
  const faces = entering ? facesOf(order, entered) : null;
  const seen = table.isDm
    ? audience === 'hidden'
      ? { hidden: true }
      : audience.startsWith('to:')
        ? { shownTo: audience.slice(3) }
        : {}
    : audience === 'dm'
      ? { private: true }
      : {};
  const roll = async () => {
    const dice = [...pool.entries()].map(([sides, count]) => ({ sides, count }));
    const done = await table.roll({
      kind: 'dice',
      ...(table.characterId ? { characterId: table.characterId } : {}),
      dice,
      modifier,
      ...seen,
      ...(faces ? { faces } : {}),
    });
    if (done) {
      setPool(new Map());
      setModifier(0);
      setEntered([]);
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
        <label className="dice-audience" htmlFor={`${ids}-audience`}>
          <span>{t('Who sees it')}</span>
          <select
            id={`${ids}-audience`}
            value={audience}
            onChange={(event) => {
              setAudience(event.target.value);
            }}
          >
            <option value="table">{t('Everyone at the table')}</option>
            {table.isDm ? (
              <>
                <option value="hidden">{t('Only me')}</option>
                {characters.map((character) => (
                  <option key={character.entityId} value={`to:${character.entityId}`}>
                    {t('{name} and me', { name: character.name })}
                  </option>
                ))}
              </>
            ) : (
              <option value="dm">{t('Only the DM and me')}</option>
            )}
          </select>
        </label>
      </div>
      {own && (
        <label className="dice-own">
          <input
            type="checkbox"
            checked={entering}
            onChange={(event) => {
              setEntering(event.target.checked);
            }}
          />
          <span>{t('I roll my own dice')}</span>
        </label>
      )}
      {entering && order.length > 0 && (
        <FaceFields dice={order} entered={entered} onChange={setEntered} />
      )}
      <p className="dice-pool" aria-live="polite">
        {words === '' ? t('Press a die to add it.') : words}
      </p>
      <div className="dice-builder-actions">
        <button
          type="button"
          className="primary-button"
          disabled={words === '' || table.busy || (entering && faces === null)}
          onClick={() => void roll()}
        >
          {entering ? t('Enter the roll') : t('Roll')}
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
