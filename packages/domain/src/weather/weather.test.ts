import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { DM, PLAYER } from '../authoring/testing/world.ts';
import { codeOf } from '../assets/testing/world.ts';
import { visualWorld } from '../visual/testing/world.ts';

/**
 * `SetWeather` (docs/adr/0023-world-visual-state.md §1; owner decision of
 * 2026-10-04): the DM sets a location's weather from now on, as a world
 * fact in history. Undo restores the weather before, under ADR 0006 §8.
 */
const blockersOf = (result: CommandResult) =>
  result.status === 'rejected'
    ? ((result.details?.['blockers'] ?? []) as { commandType: string }[]).map((b) => b.commandType)
    : [];

describe('setting the weather', () => {
  it('records the change from what was set before', async () => {
    const world = await visualWorld();
    const first = await world.as(DM, {
      type: 'SetWeather',
      locationId: 'ravenford',
      weather: 'fog',
    });
    expect(first.status).toBe('accepted');
    const recorded = (await world.snapshot()).history.filter(
      (event) => event.causation.commandId === first.commandId,
    );
    expect(recorded.map(({ type, payload }) => ({ type, payload }))).toEqual([
      { type: 'WeatherSet', payload: { locationId: 'ravenford', from: null, to: 'fog' } },
    ]);
    await world.as(DM, { type: 'SetWeather', locationId: 'ravenford', weather: 'rain' });
    expect((await world.state()).weather.get('ravenford')).toBe('rain');
    await world.verified();
  });

  it('refuses players, things that are not usable locations, and no change', async () => {
    const world = await visualWorld();
    const set = (locationId: string, weather = 'rain', actor = DM) =>
      world.as(actor, { type: 'SetWeather', locationId, weather });
    expect(codeOf(await set('ravenford', 'rain', PLAYER))).toBe('FORBIDDEN');
    expect(codeOf(await set('mira-vale'))).toBe('NOT_A_LOCATION');
    expect(codeOf(await set('nowhere'))).toBe('ENTITY_NOT_FOUND');
    expect(codeOf(await set('ravenford', 'hail'))).toBe('INVALID_COMMAND');
    expect(codeOf(await set('ravenford'))).toBe('accepted');
    expect(codeOf(await set('ravenford'))).toBe('INVALID_WEATHER');
    await world.dm({ type: 'ChangeEntityStatus', entityId: 'north-gate', status: 'destroyed' });
    expect(codeOf(await set('north-gate'))).toBe('ENTITY_DESTROYED');
  });
});

describe('undoing the weather', () => {
  it('restores the weather before, newest first', async () => {
    const world = await visualWorld();
    const fog = await world.as(DM, { type: 'SetWeather', locationId: 'ravenford', weather: 'fog' });
    const rain = await world.as(DM, {
      type: 'SetWeather',
      locationId: 'ravenford',
      weather: 'rain',
    });

    const refused = await world.undo(fog.commandId ?? '');
    expect(codeOf(refused)).toBe('UNDO_UNSAFE');
    expect(blockersOf(refused)).toEqual(['SetWeather']);

    expect(codeOf(await world.undo(rain.commandId ?? ''))).toBe('accepted');
    expect((await world.state()).weather.get('ravenford')).toBe('fog');
    expect(codeOf(await world.undo(fog.commandId ?? ''))).toBe('accepted');
    expect((await world.state()).weather.has('ravenford')).toBe(false);
    await world.verified();
  });

  it('keeps a weathered location from being undone beneath its weather', async () => {
    const world = await visualWorld();
    const created = await world.as(DM, {
      type: 'CreateEntity',
      entityId: 'watchtower',
      kind: 'location',
      name: 'Watchtower',
      existsSince: null,
      location: { type: 'site', parentId: 'ravenford' },
    });
    const weather = await world.as(DM, {
      type: 'SetWeather',
      locationId: 'watchtower',
      weather: 'storm',
    });
    expect(codeOf(await world.undo(created.commandId ?? ''))).toBe('UNDO_UNSAFE');
    expect(codeOf(await world.undo(weather.commandId ?? ''))).toBe('accepted');
    expect(codeOf(await world.undo(created.commandId ?? ''))).toBe('accepted');
    await world.verified();
  });
});
