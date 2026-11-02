import type { CharacterDerived, CharacterSheet, ClassId } from '@ltw/contracts';
import { readableLabel, useT } from '@ltw/ui';
import { useId, useState } from 'react';

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
  const spends = table !== null && (table.isDm || table.characterId === entityId);
  const { current, max } = sheet.hitPoints;
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
      <ul className="hit-dice">
        {derived.hitDice.map((pool) => (
          <li key={pool.sides} className="hit-die-row">
            <Glyph name="hit-points" />
            <span className="hit-die-kind">d{pool.sides}</span>
            <span className="hit-die-left">
              {t('{left} of {total} left', { left: pool.left, total: pool.total })}
            </span>
            {spends && (
              <button
                type="button"
                className="roll-button roll-button--text"
                disabled={locked || reason !== null || pool.left === 0 || table.busy}
                aria-describedby={reason === null ? undefined : `${id}-why`}
                onClick={() => {
                  onRun(
                    restAction({ action: 'hit-die', characterId: entityId, sides: pool.sides }),
                  );
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
 * A milestone level, for the DM (Stage 530): the class to level, then a second, deliberate press,
 * since the rules' new hit points and spell slots are recorded at once.
 */
export function GrantLevel({ entityId, sheet, locked, onRun }: Omit<SheetRestProps, 'derived'>) {
  const t = useT();
  const id = useId();
  const isDm = useDiceTable()?.isDm ?? false;
  const [chosen, setChosen] = useState<ClassId | null>(null);
  const [asking, setAsking] = useState(false);
  if (!isDm) return null;
  const level = sheet.classes.reduce((sum, entry) => sum + entry.level, 0);
  const classId = chosen ?? sheet.classes[0]?.classId ?? null;
  const entry = sheet.classes.find((option) => option.classId === classId);
  const step = (option: { classId: ClassId; level: number }) =>
    t('{class} {from} → {to}', {
      class: readableLabel(option.classId, t),
      from: option.level,
      to: option.level + 1,
    });
  return (
    <section className="hero-section" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{t('Level (DM)')}</h3>
      <p className="muted">
        {t('Level {level}. A milestone level adds hit points and spell slots by the rules.', {
          level,
        })}
      </p>
      {level >= 20 || !entry || classId === null ? (
        <p className="muted">{t('The highest level is reached.')}</p>
      ) : asking ? (
        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            disabled={locked}
            onClick={() => {
              setAsking(false);
              onRun(restAction({ action: 'level-up', characterId: entityId, classId }));
            }}
          >
            <Glyph name="confirm" />
            {t('Grant {step}', { step: step(entry) })}
          </button>
          <button
            type="button"
            onClick={() => {
              setAsking(false);
            }}
          >
            {t('Cancel')}
          </button>
        </div>
      ) : (
        <div className="inline-field">
          {sheet.classes.length > 1 && (
            <select
              aria-label={t('Class to level')}
              value={classId}
              onChange={(event) => {
                setChosen(event.target.value as ClassId);
              }}
            >
              {sheet.classes.map((option) => (
                <option key={option.classId} value={option.classId}>
                  {step(option)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              setAsking(true);
            }}
          >
            <Glyph name="blessing" />
            {t('Grant a level')}
          </button>
        </div>
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
