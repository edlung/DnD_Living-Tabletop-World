import { describe, expect, it } from 'vitest';

import { parseRecordedEvent } from '../kernel/events.ts';
import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { worldTimeAt } from '../kernel/world-time.ts';
import { hash } from '../assets/testing/world.ts';
import { DAY1, DAY1_NIGHT, DAY2, DM_VIEW, visualWorld } from './testing/world.ts';
import { entityPresentationAt, scenePresentationAt } from './views.ts';

/**
 * The Stage 160 validation gate (EXECUTION_PLAN.md; RAVENFORD_SPEC.md,
 * Return / Time; owner decisions of 2026-10-04): Ravenford Day 1 vs Day 2
 * resolves deterministically from state. Clear skies on Day 1 and rain on
 * Day 2, set by the DM as world facts; the day phase follows the clock.
 */
const SQUARE = 'market-square';

describe('Ravenford, Day 1 and Day 2', () => {
  it('shows clear skies on Day 1, rain on Day 2, and night by the clock', async () => {
    const world = await visualWorld();
    await world.dayTwo();
    const snapshot = await world.snapshot();
    expect(snapshot.state.clock).toBe(DAY2);

    const day1 = scenePresentationAt(snapshot, DM_VIEW, SQUARE, DAY1);
    const night = scenePresentationAt(snapshot, DM_VIEW, SQUARE, DAY1_NIGHT);
    const day2 = scenePresentationAt(snapshot, DM_VIEW, SQUARE, DAY2);
    expect(day1).toMatchObject({ worldTime: DAY1, phase: 'day', location: { weather: 'clear' } });
    expect(night).toMatchObject({
      phase: 'night',
      location: { weather: 'clear', tags: ['night', 'clear'] },
    });
    expect(day2).toMatchObject({
      phase: 'day',
      location: { weather: 'rain', tags: ['day', 'rain'] },
    });
    // Mira stands in the square in the rain; Ravenford itself carries the weather it was given.
    expect(day2?.present.find((entity) => entity.entityId === 'mira-vale')).toMatchObject({
      weather: 'rain',
      status: 'active',
    });
    expect(entityPresentationAt(snapshot, DM_VIEW, 'ravenford', DAY2)?.presentation.weather).toBe(
      'rain',
    );
    // Before anyone set the weather, there is none to show.
    expect(
      entityPresentationAt(snapshot, DM_VIEW, 'ravenford', worldTimeAt(1, 9))?.presentation.weather,
    ).toBeNull();
    // The present is the default time.
    expect(scenePresentationAt(snapshot, DM_VIEW, SQUARE, null)).toEqual(day2);
  });

  it('chooses the approved variant the state calls for, and the reference otherwise', async () => {
    const world = await visualWorld();
    const reference = await world.approved('ravenford', 1);
    const rain = await world.approved('ravenford', 2, { variant: 'derived', label: 'rain' });
    const rainyNight = await world.approved('ravenford', 3, {
      variant: 'derived',
      label: 'night-rain',
    });
    await world.dayTwo();
    const snapshot = await world.snapshot();
    const imageAt = (time: number) =>
      entityPresentationAt(snapshot, DM_VIEW, 'ravenford', time)?.presentation.image?.contentHash;
    const contentOf = (assetId: string) => snapshot.state.assets.assets.get(assetId)?.contentHash;

    expect(imageAt(DAY1)).toBe(contentOf(reference));
    expect(imageAt(DAY1_NIGHT)).toBe(contentOf(reference));
    expect(imageAt(DAY2)).toBe(contentOf(rain));
    // The most specific variant wins once its every part holds.
    await world.dm({ type: 'AdvanceWorldTime', to: worldTimeAt(2, 21) });
    const night = await world.snapshot();
    expect(
      entityPresentationAt(night, DM_VIEW, 'ravenford', null)?.presentation.image?.contentHash,
    ).toBe(contentOf(rainyNight));
    expect(contentOf(rainyNight)).toBe(hash(3));
  });

  it('resolves the same views from the stored history, after Day 60, and again', async () => {
    const world = await visualWorld();
    await world.dayTwo();
    const before = await world.snapshot();
    const day1 = scenePresentationAt(before, DM_VIEW, SQUARE, DAY1);
    const day2 = scenePresentationAt(before, DM_VIEW, SQUARE, DAY2);

    await world.dm({ type: 'AdvanceWorldTime', to: worldTimeAt(60, 12) });
    await world.dm({ type: 'SetWeather', locationId: 'ravenford', weather: 'snow' });
    await world.dm({
      type: 'PlaceEntity',
      entityId: 'mira-vale',
      locationId: 'golden-stag-inn',
    });
    const later = await world.snapshot();
    expect(scenePresentationAt(later, DM_VIEW, SQUARE, DAY1)).toEqual(day1);
    expect(scenePresentationAt(later, DM_VIEW, SQUARE, DAY2)).toEqual(day2);
    expect(scenePresentationAt(later, DM_VIEW, SQUARE, null)).toMatchObject({
      location: { weather: 'snow' },
    });

    // Replayed from stored JSON, the views are identical.
    const stored = (JSON.parse(JSON.stringify(later.history)) as unknown[]).map(parseRecordedEvent);
    const replayed = { state: replay(stored), history: stored };
    expect(checkWorldIntegrity(replayed.state)).toEqual([]);
    for (const time of [DAY1, DAY1_NIGHT, DAY2, null]) {
      expect(scenePresentationAt(replayed, DM_VIEW, SQUARE, time)).toEqual(
        scenePresentationAt(later, DM_VIEW, SQUARE, time),
      );
    }
    expect(() => scenePresentationAt(later, DM_VIEW, SQUARE, worldTimeAt(61))).toThrow(RangeError);
    await world.verified();
  });
});
