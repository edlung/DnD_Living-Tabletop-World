import { describe, expect, it } from 'vitest';

import { DM } from '../authoring/testing/world.ts';
import { worldTimeAt } from '../kernel/world-time.ts';
import { DAY1, DAY2, visualWorld } from './testing/world.ts';
import { dayPhaseAt, visualTimelineAt } from './timeline.ts';

/** Day phases, inherited weather, and sheets at a world time (ADR 0023 §2). */
describe('day phases', () => {
  it('follow the hour of the world clock, before the epoch too', () => {
    const at = (hour: number, minute = 0) => dayPhaseAt(worldTimeAt(1, hour, minute));
    expect([
      at(0),
      at(4, 59),
      at(5),
      at(6, 59),
      at(7),
      at(17, 59),
      at(18),
      at(19, 59),
      at(20),
    ]).toEqual(['night', 'night', 'dawn', 'dawn', 'day', 'day', 'dusk', 'dusk', 'night']);
    expect(dayPhaseAt(worldTimeAt(-1, 5))).toBe('dawn');
    expect(dayPhaseAt(worldTimeAt(-3, 23))).toBe('night');
  });
});

describe('weather at a world time', () => {
  it('is inherited from the nearest location that has one, as it was then', async () => {
    const world = await visualWorld();
    await world.dayTwo();
    await world.dm({ type: 'SetWeather', locationId: 'north-gate', weather: 'fog' });
    const { history, state } = await world.snapshot();
    const day1 = visualTimelineAt(history, DAY1, state);
    const day2 = visualTimelineAt(history, DAY2, state);
    expect(day1.weatherOf('golden-stag-inn')).toBe('clear');
    expect(day2.weatherOf('golden-stag-inn')).toBe('rain');
    expect(day2.weatherOf('north-gate')).toBe('fog');
    expect(day1.weatherOf('north-gate')).toBe('clear');
    // The Old Trade Road lies outside Ravenford: nobody set its weather.
    expect(day2.weatherOf('abandoned-caravan-site')).toBeNull();
  });

  it('forgets undone weather', async () => {
    const world = await visualWorld();
    await world.dayTwo();
    const storm = await world.as(DM, {
      type: 'SetWeather',
      locationId: 'ravenford',
      weather: 'storm',
    });
    await world.undo(storm.commandId ?? '');
    const { history, state } = await world.snapshot();
    expect(visualTimelineAt(history, DAY2, state).weatherOf('ravenford')).toBe('rain');
  });
});

describe('sheets at a world time', () => {
  it('show the hit points a sheet had then', async () => {
    const world = await visualWorld();
    const sheet = (await world.state()).characterSheets.get('elowen-starwhisper');
    if (!sheet) throw new Error('no sheet');
    await world.dayTwo();
    await world.dm({
      type: 'SetCharacterSheet',
      entityId: 'elowen-starwhisper',
      sheet: { ...sheet, hitPoints: { max: 78, current: 30 }, conditions: ['prone'] },
    });
    const { history, state } = await world.snapshot();
    expect(visualTimelineAt(history, DAY1, state).vitals.get('elowen-starwhisper')).toMatchObject({
      hitPoints: { current: 78 },
      conditions: [],
    });
    expect(visualTimelineAt(history, DAY2, state).vitals.get('elowen-starwhisper')).toMatchObject({
      hitPoints: { current: 30 },
      conditions: ['prone'],
    });
  });
});
