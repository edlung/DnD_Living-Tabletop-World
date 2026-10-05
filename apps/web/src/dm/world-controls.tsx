import { WEATHERS, type KernelCommandOf } from '@ltw/contracts';
import { useState } from 'react';

import type { ExplorationIntent } from '../exploration/use-action.ts';
import { DAY_TWO_MORNING } from './world-time.ts';
import { useT } from '@ltw/ui';

export type DmWorldCommand = KernelCommandOf<'AdvanceWorldTime' | 'SetWeather'>;

/**
 * The DM moves the clock and the weather with the existing commands. The world
 * answers: players see a changed time and sky the next time they look.
 */
export function DmWorldControls({
  locationId,
  locationName,
  locked,
  open,
  onToggle,
  weather,
  onWeather,
  onRun,
}: {
  readonly weather: (typeof WEATHERS)[number];
  readonly onWeather: (weather: (typeof WEATHERS)[number]) => void;
  readonly open: boolean;
  readonly onToggle: (open: boolean) => void;
  readonly locationId: string;
  readonly locationName: string;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const [hours, setHours] = useState('8');
  const run = (command: DmWorldCommand) => {
    onRun({ kind: 'command', command });
  };
  const amount = Number(hours);
  return (
    <details
      className="disclosure dm-world"
      open={open}
      onToggle={(event) => {
        onToggle(event.currentTarget.open);
      }}
    >
      <summary>{t('Time and weather (DM)')}</summary>
      <div className="action-row">
        <button
          disabled={locked}
          onClick={() => {
            run({ type: 'AdvanceWorldTime', to: DAY_TWO_MORNING });
          }}
        >
          {t('Advance to Day 2, 10:00')}
        </button>
      </div>
      <label htmlFor="advance-hours">{t('Or advance by (hours)')}</label>
      <input
        id="advance-hours"
        type="number"
        min="1"
        max="72"
        value={hours}
        onChange={(event) => {
          setHours(event.target.value);
        }}
      />
      <button
        disabled={locked || !Number.isInteger(amount) || amount < 1 || amount > 72}
        onClick={() => {
          run({ type: 'AdvanceWorldTime', by: amount * 3600 });
        }}
      >
        {t('Advance time')}
      </button>
      <label htmlFor="weather-choice">{t('Weather at {place}', { place: locationName })}</label>
      <select
        id="weather-choice"
        value={weather}
        onChange={(event) => {
          onWeather(event.target.value as (typeof WEATHERS)[number]);
        }}
      >
        {WEATHERS.map((entry) => (
          <option key={entry} value={entry}>
            {t(entry)}
          </option>
        ))}
      </select>
      <button
        disabled={locked}
        onClick={() => {
          run({ type: 'SetWeather', locationId, weather });
        }}
      >
        {t('Set weather')}
      </button>
    </details>
  );
}
