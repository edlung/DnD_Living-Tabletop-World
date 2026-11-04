import {
  PACE_MILES_PER_HOUR,
  TRAVEL_DAY_HOURS,
  TRAVEL_PACES,
  maxTravelPace,
  type TravelPace,
  type WorldMapResponse,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { ExplorationIntent } from '../exploration/use-action.ts';
import { Glyph } from '../visual/glyph.tsx';
import { Opening } from './opening.tsx';
import { PACE_EFFECTS, PACE_NAMES, TERRAIN_WORDS } from './travel-words.ts';

/**
 * The DM moves the party (docs/adr/0057-encounters-maps-loot.md §10): where to along a route from
 * where they stand, at a pace the route allows (its terrain's, one step more on a good road), so
 * many hours a day, who goes — then the hours and days it takes and the saves of each hour past 8,
 * before the World Engine moves them, rolls the saves and advances the clock.
 */
export function TravelForm({
  map,
  locked,
  onRun,
}: {
  readonly map: WorldMapResponse;
  readonly locked: boolean;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  const here = map.hereId;
  const ways = map.routes.flatMap((route) =>
    route.from.entityId === here
      ? [{ to: route.to, route }]
      : route.to.entityId === here
        ? [{ to: route.from, route }]
        : [],
  );
  const [toId, setToId] = useState('');
  const [pace, setPace] = useState<TravelPace>('normal');
  const [hoursPerDay, setHoursPerDay] = useState(TRAVEL_DAY_HOURS);
  const [left, setLeft] = useState<readonly string[]>([]);
  if (here === null || ways.length === 0) return null;
  const way = ways.find((one) => one.to.entityId === toId) ?? null;
  const fastest = way ? maxTravelPace(way.route.terrain, way.route.road, false) : 'fast';
  const allowed = (one: TravelPace) => TRAVEL_PACES.indexOf(one) <= TRAVEL_PACES.indexOf(fastest);
  const going = map.party.filter((one) => !left.includes(one.entityId));
  const hours = way ? Math.ceil(way.route.miles / PACE_MILES_PER_HOUR[pace]) : 0;
  const days = Math.ceil(hours / hoursPerDay);
  const pushed = Math.max(0, Math.min(hours, hoursPerDay) - TRAVEL_DAY_HOURS);
  return (
    <Opening
      className="travel-form"
      summary={
        <>
          <Glyph name="travel" />
          {t('Travel')}
        </>
      }
    >
      <div className="hand-form">
        <div className="account-field">
          <label htmlFor={`${ids}-to`}>{t('Where to')}</label>
          <select
            id={`${ids}-to`}
            value={toId}
            onChange={(event) => {
              setToId(event.target.value);
              setPace('normal');
            }}
          >
            <option value="">{t('Choose…')}</option>
            {ways.map((one) => (
              <option key={one.to.entityId} value={one.to.entityId}>
                {t('{place}, {miles} mi', { place: one.to.name, miles: one.route.miles })}
              </option>
            ))}
          </select>
        </div>
        {way && (
          <fieldset className="travel-paces">
            <legend>
              {t('Pace: on {terrain}{road}, {fastest} at most', {
                terrain: t(TERRAIN_WORDS[way.route.terrain]),
                road: way.route.road ? t(', a good road') : '',
                fastest: t(PACE_NAMES[fastest]),
              })}
            </legend>
            {TRAVEL_PACES.map((one) => (
              <label key={one} className="travel-pace">
                <input
                  type="radio"
                  name={`${ids}-pace`}
                  checked={pace === one}
                  disabled={!allowed(one)}
                  onChange={() => {
                    setPace(one);
                  }}
                />
                <span>
                  <strong>{t(PACE_NAMES[one])}</strong> {t(PACE_EFFECTS[one])}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="account-field travel-hours">
          <label htmlFor={`${ids}-hours`}>{t('Hours on the road a day')}</label>
          <input
            id={`${ids}-hours`}
            type="number"
            min={1}
            max={16}
            value={hoursPerDay}
            onChange={(event) => {
              const next = Math.round(Number(event.target.value));
              setHoursPerDay(Math.min(16, Math.max(1, next || TRAVEL_DAY_HOURS)));
            }}
          />
        </div>
        {map.party.length > 0 && (
          <fieldset className="hand-choice">
            <legend>{t('Who travels')}</legend>
            {map.party.map((one) => (
              <label key={one.entityId}>
                <input
                  type="checkbox"
                  checked={!left.includes(one.entityId)}
                  onChange={(event) => {
                    setLeft((before) =>
                      event.target.checked
                        ? before.filter((id) => id !== one.entityId)
                        : [...before, one.entityId],
                    );
                  }}
                />
                {one.name}
              </label>
            ))}
          </fieldset>
        )}
        {way && (
          <p className="travel-sum" role="status">
            {t('Hours on the road: {hours}; days: {days}.', { hours, days })}
            {pushed > 0 &&
              ` ${t('Past 8 hours a day, each traveller makes a Constitution save each hour (DC 11 and up) or gains a level of Exhaustion.')}`}
          </p>
        )}
        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            disabled={locked || !way || !allowed(pace) || going.length === 0}
            onClick={() => {
              if (!way) return;
              onRun({
                kind: 'command',
                command: {
                  type: 'Travel',
                  toId: way.to.entityId,
                  pace,
                  hoursPerDay,
                  travellerIds: going.map((one) => one.entityId),
                },
              });
            }}
          >
            {t('Set out')}
          </button>
        </div>
      </div>
    </Opening>
  );
}
