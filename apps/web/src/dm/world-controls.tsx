import { WEATHERS, type KernelCommandOf, type ScenePresentationResponse } from '@ltw/contracts';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';
import { phaseGlyph, weatherGlyph } from '../visual/glyph-map.ts';
import { formatWorldTime, nextMorning } from './world-time.ts';
import { useT } from '@ltw/ui';

export type DmWorldCommand = KernelCommandOf<'AdvanceWorldTime' | 'SetWeather'>;

/**
 * The DM moves the clock and the weather with the existing commands, in the "Time and weather"
 * sheet (docs/STAGE_320_DESIGN.md §5.7): the day and hour with the phase's glyph, the next-day
 * control, and the place's weather now with its glyph beside the choice. The world answers:
 * players see a changed time and sky the next time they look. The day control offers the next
 * day's morning after the current world time, read from the viewed place's scene, so it never
 * offers a day already reached (ADR 0033 §8).
 */
export function DmWorldControls({
  api,
  revision,
  locationId,
  locationName,
  locked,
  weather,
  onWeather,
  onRun,
}: {
  readonly weather: (typeof WEATHERS)[number];
  readonly onWeather: (weather: (typeof WEATHERS)[number]) => void;
  readonly api: WorldApi;
  /** The world screen's refresh count: the clock is read again after each command. */
  readonly revision: number;
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
  const loadNow = useCallback(
    (signal: AbortSignal) =>
      api.get<ScenePresentationResponse>(
        `locations/${encodeURIComponent(locationId)}/scene`,
        signal,
      ),
    [api, locationId],
  );
  const { resource: now } = useResource(`clock:${locationId}:${String(revision)}`, loadNow);
  const scene = now.status === 'ready' ? now.value : null;
  const next = scene ? nextMorning(scene.worldTime) : null;
  const sky = scene?.location.weather ?? null;
  return (
    <div className="dm-world">
      <section className="tool-group" aria-labelledby="dm-time-title">
        <h3 id="dm-time-title">
          <Glyph name="time" />
          {t('World time')}
        </h3>
        {scene && (
          <p className="tool-now">
            <Glyph name="day-counter" />
            <span>{formatWorldTime(scene.worldTime, t)}</span>
            <span className="tool-now-detail">
              <Glyph name={phaseGlyph(scene.phase)} />
              {t(scene.phase)}
            </span>
          </p>
        )}
        {next && (
          <div className="action-row">
            <button
              className="primary-button"
              disabled={locked}
              onClick={() => {
                run({ type: 'AdvanceWorldTime', to: next.at });
              }}
            >
              <Glyph name="next-day" />
              {t('Advance to Day {day}, 10:00', { day: next.day })}
            </button>
          </div>
        )}
        <label htmlFor="advance-hours">{t('Or advance by (hours)')}</label>
        <div className="inline-field">
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
        </div>
      </section>
      <section className="tool-group" aria-labelledby="dm-weather-title">
        <h3 id="dm-weather-title">
          <Glyph name="weather" />
          {t('Weather')}
        </h3>
        {scene && (
          <p className="tool-now">
            {sky ? <Glyph name={weatherGlyph(sky)} /> : <Glyph name="unknown" />}
            <span>{sky ? t('Now: {weather}', { weather: t(sky) }) : t('Now: not set')}</span>
          </p>
        )}
        <label htmlFor="weather-choice">{t('Weather at {place}', { place: locationName })}</label>
        <div className="inline-field weather-field">
          <Glyph name={weatherGlyph(weather)} className="weather-choice-glyph" />
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
        </div>
      </section>
    </div>
  );
}
