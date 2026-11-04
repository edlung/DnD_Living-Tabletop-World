import type { CharacterSheet, EntityRef, ResourceView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { UseFeature } from './feature-section.tsx';

/**
 * The class features whose use asks a choice first (docs/adr/0056-characters-from-the-srd.md §4):
 * whom Lay on Hands touches and how many points, whom Bardic Inspiration goes to, Font of Magic's
 * slot, and the slots Arcane Recovery brings back. The World Engine checks each.
 */
interface FormProps {
  readonly view: ResourceView;
  readonly locked: boolean;
  readonly use: UseFeature;
}

/** Font of Magic (SRD 5.2.1): a slot's cost in points, and the Sorcerer level that makes it. */
const SLOT_COST = [2, 3, 5, 6, 7] as const;
const SLOT_LEVEL = [2, 3, 5, 7, 9] as const;

const levelIn = (sheet: CharacterSheet, classId: string) =>
  sheet.classes.find((entry) => entry.classId === classId)?.level ?? 0;

export function LayOnHands({
  view,
  entityId,
  party,
  locked,
  use,
}: FormProps & { readonly entityId: string; readonly party: readonly EntityRef[] }) {
  const t = useT();
  const ids = useId();
  const [targetId, setTargetId] = useState(entityId);
  const [points, setPoints] = useState('');
  const amount = Number(points);
  return (
    <div className="feature-form">
      <div className="feature-field">
        <label htmlFor={`${ids}-who`}>{t('Whom you touch')}</label>
        <select
          id={`${ids}-who`}
          value={targetId}
          onChange={(event) => {
            setTargetId(event.target.value);
          }}
        >
          {party.map((one) => (
            <option key={one.entityId} value={one.entityId}>
              {one.name}
            </option>
          ))}
        </select>
      </div>
      <div className="feature-field">
        <label htmlFor={`${ids}-points`}>{t('Points')}</label>
        <input
          id={`${ids}-points`}
          inputMode="numeric"
          value={points}
          onChange={(event) => {
            setPoints(event.target.value.replace(/\D/g, '').slice(0, 3));
          }}
        />
      </div>
      <div className="feature-actions">
        <button
          type="button"
          disabled={locked || !(amount >= 1 && amount <= view.left)}
          onClick={() => {
            use('lay-on-hands', { targetId, amount });
            setPoints('');
          }}
        >
          {t('Heal')}
        </button>
        <button
          type="button"
          disabled={locked || view.left < 5}
          onClick={() => {
            use('lay-on-hands', { targetId, option: 'cure-poison' });
          }}
        >
          {t('End Poisoned (5 points)')}
        </button>
      </div>
    </div>
  );
}

export function Inspire({
  view,
  entityId,
  party,
  locked,
  use,
}: FormProps & { readonly entityId: string; readonly party: readonly EntityRef[] }) {
  const t = useT();
  const ids = useId();
  const others = party.filter((one) => one.entityId !== entityId);
  const [targetId, setTargetId] = useState(others[0]?.entityId ?? '');
  return (
    <div className="feature-form">
      <div className="feature-field">
        <label htmlFor={`${ids}-who`}>{t('Whom you inspire')}</label>
        <select
          id={`${ids}-who`}
          value={targetId}
          onChange={(event) => {
            setTargetId(event.target.value);
          }}
        >
          {others.map((one) => (
            <option key={one.entityId} value={one.entityId}>
              {one.name}
            </option>
          ))}
        </select>
      </div>
      <div className="feature-actions">
        <button
          type="button"
          disabled={locked || view.left === 0 || targetId === ''}
          onClick={() => {
            use('bardic-inspiration', { targetId });
          }}
        >
          {t('Inspire')}
        </button>
      </div>
    </div>
  );
}

export function FontOfMagic({
  view,
  sheet,
  locked,
  use,
}: FormProps & { readonly sheet: CharacterSheet }) {
  const t = useT();
  const ids = useId();
  const sorcerer = levelIn(sheet, 'sorcerer');
  const makes = SLOT_COST.flatMap((cost, index) =>
    sorcerer >= (SLOT_LEVEL[index] ?? 21) ? [{ level: index + 1, cost }] : [],
  );
  const free = sheet.spellSlots.max.flatMap((max, index) =>
    max - (sheet.spellSlots.expended[index] ?? 0) > 0 ? [index + 1] : [],
  );
  const [make, setMake] = useState(String(makes[0]?.level ?? ''));
  const [turn, setTurn] = useState(String(free[0] ?? ''));
  const cost = makes.find((one) => String(one.level) === make)?.cost ?? 99;
  return (
    <div className="feature-form">
      <div className="feature-field">
        <label htmlFor={`${ids}-make`}>{t('A slot from points')}</label>
        <select
          id={`${ids}-make`}
          value={make}
          onChange={(event) => {
            setMake(event.target.value);
          }}
        >
          {makes.map((one) => (
            <option key={one.level} value={one.level}>
              {t('Level {level}: {cost} points', one)}
            </option>
          ))}
        </select>
      </div>
      <div className="feature-actions">
        <button
          type="button"
          disabled={locked || make === '' || view.left < cost}
          onClick={() => {
            use('sorcery-points', { option: 'create-slot', slots: [Number(make)] });
          }}
        >
          {t('Make the slot')}
        </button>
      </div>
      <div className="feature-field">
        <label htmlFor={`${ids}-turn`}>{t('Points from a slot')}</label>
        <select
          id={`${ids}-turn`}
          value={turn}
          onChange={(event) => {
            setTurn(event.target.value);
          }}
        >
          {free.map((level) => (
            <option key={level} value={level}>
              {t('A level {level} slot: {level} points', { level })}
            </option>
          ))}
        </select>
      </div>
      <div className="feature-actions">
        <button
          type="button"
          disabled={locked || turn === '' || view.left === view.max}
          onClick={() => {
            use('sorcery-points', { option: 'convert-slot', slots: [Number(turn)] });
          }}
        >
          {t('Turn it into points')}
        </button>
      </div>
    </div>
  );
}

export function ArcaneRecovery({
  view,
  sheet,
  locked,
  use,
}: FormProps & { readonly sheet: CharacterSheet }) {
  const t = useT();
  const ids = useId();
  const limit = Math.ceil(levelIn(sheet, 'wizard') / 2);
  const expended = [1, 2, 3, 4, 5].filter(
    (level) => (sheet.spellSlots.expended[level - 1] ?? 0) > 0,
  );
  const [chosen, setChosen] = useState<readonly number[]>([]);
  const total = chosen.reduce((sum, level) => sum + level, 0);
  return (
    <div className="feature-form">
      <fieldset className="feature-slots" aria-describedby={`${ids}-limit`}>
        <legend>{t('Expended slots to recover')}</legend>
        {expended.length === 0 ? (
          <p className="muted">{t('No slot of 1st to 5th level is expended.')}</p>
        ) : (
          expended.map((level) => (
            <label key={level}>
              <input
                type="checkbox"
                checked={chosen.includes(level)}
                onChange={(event) => {
                  setChosen((before) =>
                    event.target.checked
                      ? [...before, level]
                      : before.filter((one) => one !== level),
                  );
                }}
              />
              {t('Level {level}', { level })}
            </label>
          ))
        )}
        <p id={`${ids}-limit`} className="muted">
          {t('Up to {limit} slot levels in all: {total} chosen.', { limit, total })}
        </p>
      </fieldset>
      <div className="feature-actions">
        <button
          type="button"
          disabled={locked || view.left === 0 || chosen.length === 0 || total > limit}
          onClick={() => {
            use('arcane-recovery', { slots: [...chosen].sort((a, b) => a - b) });
            setChosen([]);
          }}
        >
          {t('Recover the slots')}
        </button>
      </div>
    </div>
  );
}
