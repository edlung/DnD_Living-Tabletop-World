import {
  ABILITIES,
  BOARD_HAZARDS,
  BOARD_TRAP_IDS,
  type BoardHazard,
  type BoardTrapId,
  type TerrainPaint,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import { ABILITY_NAMES } from '../character/words.ts';
import { TRAP_WORDS, trapTiers } from '../rules/toolbox-words.ts';
import { HAZARD_WORDS } from './terrain-words.ts';

/**
 * What the DM's trap and harmful-ground brushes lay (docs/adr/0057-encounters-maps-loot.md §6):
 * one of the Toolbox's traps at the characters' levels, hidden from the players or in sight; or
 * fire, acid or a poison cloud with its dice, its save and its DC — each a stroke's worth.
 */
type TrapBrush = Extract<TerrainPaint, { kind: 'trap' }>;
type HazardBrush = Extract<TerrainPaint, { kind: 'hazard' }>;

export const DEFAULT_TRAP: TrapBrush = {
  kind: 'trap',
  trapId: 'hidden-pit',
  tier: 1,
  hidden: true,
};
/** Fire and acid are dodged (Dexterity); a poison cloud is endured (Constitution). */
const hazardOf = (kind: BoardHazard['kind']): BoardHazard => ({
  kind,
  dice: { count: 2, sides: 6 },
  ability: kind === 'poison' ? 'con' : 'dex',
  dc: 12,
  onSuccess: 'half',
});
export const DEFAULT_HAZARD: HazardBrush = { kind: 'hazard', hazard: hazardOf('fire') };

const SIDES = [4, 6, 8, 10, 12] as const;
const COUNTS = Array.from({ length: 10 }, (_, index) => index + 1);
const DCS = Array.from({ length: 26 }, (_, index) => index + 5);

export function TrapOptions({
  brush,
  onBrush,
}: {
  readonly brush: TrapBrush;
  readonly onBrush: (brush: TrapBrush) => void;
}) {
  const t = useT();
  const ids = useId();
  return (
    <div className="danger-options">
      <div className="builder-fields">
        <div className="account-field">
          <label htmlFor={`${ids}-trap`}>{t('Kind of trap')}</label>
          <select
            id={`${ids}-trap`}
            value={brush.trapId}
            onChange={(event) => {
              onBrush({ ...brush, trapId: event.target.value as BoardTrapId, tier: 1 });
            }}
          >
            {BOARD_TRAP_IDS.map((id) => (
              <option key={id} value={id}>
                {t(TRAP_WORDS[id])}
              </option>
            ))}
          </select>
        </div>
        <div className="account-field">
          <label htmlFor={`${ids}-tier`}>{t('For characters of')}</label>
          <select
            id={`${ids}-tier`}
            value={brush.tier}
            onChange={(event) => {
              onBrush({ ...brush, tier: Number(event.target.value) });
            }}
          >
            {trapTiers(brush.trapId).map((range, index) => (
              <option key={range} value={index + 1}>
                {t('levels {range}', { range })}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="paint-brush">
        <input
          id={`${ids}-hidden`}
          type="checkbox"
          checked={brush.hidden}
          onChange={(event) => {
            onBrush({ ...brush, hidden: event.target.checked });
          }}
        />
        <label htmlFor={`${ids}-hidden`}>{t('Hidden from the players')}</label>
      </div>
    </div>
  );
}

export function HazardOptions({
  brush,
  onBrush,
}: {
  readonly brush: HazardBrush;
  readonly onBrush: (brush: HazardBrush) => void;
}) {
  const t = useT();
  const ids = useId();
  const { hazard } = brush;
  const set = (next: Partial<BoardHazard>) => {
    onBrush({ kind: 'hazard', hazard: { ...hazard, ...next } });
  };
  return (
    <div className="danger-options">
      <div className="builder-fields">
        <div className="account-field">
          <label htmlFor={`${ids}-kind`}>{t('Harm')}</label>
          <select
            id={`${ids}-kind`}
            value={hazard.kind}
            onChange={(event) => {
              onBrush({
                kind: 'hazard',
                hazard: hazardOf(event.target.value as BoardHazard['kind']),
              });
            }}
          >
            {BOARD_HAZARDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(HAZARD_WORDS[kind])}
              </option>
            ))}
          </select>
        </div>
        <div className="account-field">
          <label htmlFor={`${ids}-count`}>{t('Dice')}</label>
          <select
            id={`${ids}-count`}
            value={hazard.dice.count}
            onChange={(event) => {
              set({ dice: { ...hazard.dice, count: Number(event.target.value) } });
            }}
          >
            {COUNTS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>
        <div className="account-field">
          <label htmlFor={`${ids}-sides`}>{t('Die')}</label>
          <select
            id={`${ids}-sides`}
            value={hazard.dice.sides}
            onChange={(event) => {
              set({
                dice: {
                  ...hazard.dice,
                  sides: Number(event.target.value) as BoardHazard['dice']['sides'],
                },
              });
            }}
          >
            {SIDES.map((sides) => (
              <option key={sides} value={sides}>
                {`d${String(sides)}`}
              </option>
            ))}
          </select>
        </div>
        <div className="account-field">
          <label htmlFor={`${ids}-save`}>{t('Save')}</label>
          <select
            id={`${ids}-save`}
            value={hazard.ability}
            onChange={(event) => {
              set({ ability: event.target.value as BoardHazard['ability'] });
            }}
          >
            {ABILITIES.map((ability) => (
              <option key={ability} value={ability}>
                {t(ABILITY_NAMES[ability])}
              </option>
            ))}
          </select>
        </div>
        <div className="account-field">
          <label htmlFor={`${ids}-dc`}>{t('DC')}</label>
          <select
            id={`${ids}-dc`}
            value={hazard.dc}
            onChange={(event) => {
              set({ dc: Number(event.target.value) });
            }}
          >
            {DCS.map((dc) => (
              <option key={dc} value={dc}>
                {dc}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="paint-brush">
        <input
          id={`${ids}-half`}
          type="checkbox"
          checked={hazard.onSuccess === 'half'}
          onChange={(event) => {
            set({ onSuccess: event.target.checked ? 'half' : 'none' });
          }}
        />
        <label htmlFor={`${ids}-half`}>{t('Half the damage on a successful save')}</label>
      </div>
    </div>
  );
}
