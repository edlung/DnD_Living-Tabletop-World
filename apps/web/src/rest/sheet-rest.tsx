import { effectiveMaximum, type CharacterDerived, type CharacterSheet } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { facesOf, useOwnDice } from '../dice/own-dice.tsx';
import { useDiceTable } from '../dice/table.tsx';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';
import { restAction } from './rest-intent.ts';

interface SheetRestProps {
  readonly entityId: string;
  readonly sheet: CharacterSheet;
  readonly derived: CharacterDerived;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}

/**
 * Hit Point Dice on the character's sheet (Stage 530): how many of each are left, and, in a short
 * rest the DM opened, one button per size to spend one: the server rolls it and the dice fly. The
 * character's own player and the DM may spend; the reason a die cannot be spent is said beside.
 */
export function HitDice({ entityId, sheet, derived, locked, onRun }: SheetRestProps) {
  const t = useT();
  const id = useId();
  const table = useDiceTable();
  // One's own Hit Point Die (ADR 0044 §4): its face entered beside it.
  const own = useOwnDice();
  const [entering, setEntering] = useState(false);
  const [faces, setFaces] = useState<Readonly<Record<number, string>>>({});
  const spends = table !== null && (table.isDm || table.characterId === entityId);
  const { current } = sheet.hitPoints;
  const max = effectiveMaximum(sheet.hitPoints);
  const reason =
    (table?.rest ?? null) === null
      ? t('Hit Point Dice are spent in a short rest the DM calls.')
      : current === 0
        ? t('Unconscious: no Hit Point Die can be spent.')
        : current >= max
          ? t('At full hit points: nothing to recover.')
          : null;
  return (
    <section className="hero-section" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{t('Hit Point Dice')}</h3>
      {spends && own && (
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
      <ul className="hit-dice">
        {derived.hitDice.map((pool) => (
          <li key={pool.sides} className="hit-die-row">
            <Glyph name="hit-points" />
            <span className="hit-die-kind">d{pool.sides}</span>
            <span className="hit-die-left">
              {t('{left} of {total} left', { left: pool.left, total: pool.total })}
            </span>
            {spends && entering && (
              <label className="hit-die-face">
                <span>{t('My d{sides} shows', { sides: pool.sides })}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={pool.sides}
                  value={faces[pool.sides] ?? ''}
                  onChange={(event) => {
                    setFaces({ ...faces, [pool.sides]: event.target.value });
                  }}
                />
              </label>
            )}
            {spends && (
              <button
                type="button"
                className="roll-button roll-button--text"
                disabled={
                  locked ||
                  reason !== null ||
                  pool.left === 0 ||
                  table.busy ||
                  (entering && facesOf([pool.sides], [faces[pool.sides] ?? '']) === null)
                }
                aria-describedby={reason === null ? undefined : `${id}-why`}
                onClick={() => {
                  const face = entering
                    ? facesOf([pool.sides], [faces[pool.sides] ?? ''])?.[0]
                    : undefined;
                  onRun(
                    restAction({
                      action: 'hit-die',
                      characterId: entityId,
                      sides: pool.sides,
                      ...(face === undefined ? {} : { face }),
                    }),
                  );
                  setFaces({ ...faces, [pool.sides]: '' });
                }}
              >
                <Glyph name="roll" />
                <span>{t('Spend a d{sides}', { sides: pool.sides })}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      {spends && reason !== null && (
        <p id={`${id}-why`} className="muted">
          {reason}
        </p>
      )}
    </section>
  );
}

/**
 * The short rest at the table, over the world: what it is for, and the way to it. It lies in the
 * table's questions over the stage (`alerts/table-asks.tsx`).
 */
export function RestBanner({
  isDm,
  actorId,
  fighting,
  locked,
  onRun,
  onOpenSheet,
}: {
  readonly isDm: boolean;
  readonly actorId: string | null;
  readonly fighting: boolean;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
  readonly onOpenSheet: (characterId: string) => void;
}) {
  const t = useT();
  const rest = useDiceTable()?.rest ?? null;
  const shown = rest !== null && !fighting && (isDm || actorId !== null);
  if (!shown) return null;
  return (
    <div className="rest-banner">
      <Glyph name="dawn" />
      <span className="rest-banner-text">
        {isDm
          ? t('Short rest: the players spend Hit Point Dice.')
          : t('Short rest: spend Hit Point Dice to recover.')}
      </span>
      {isDm ? (
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            onRun(restAction({ action: 'end' }));
          }}
        >
          {t('End the short rest')}
        </button>
      ) : (
        actorId !== null && (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              onOpenSheet(actorId);
            }}
          >
            <Glyph name="hit-points" />
            {t('Spend Hit Point Dice')}
          </button>
        )
      )}
    </div>
  );
}
