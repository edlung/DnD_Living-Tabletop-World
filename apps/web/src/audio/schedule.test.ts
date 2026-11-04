import { ambienceFor, sceneAmbience } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { chirps, crackles, raindrops } from './schedule.ts';

/**
 * The soundscapes' moments (docs/adr/0059-atmosphere.md §1): a window of rain holds many drops, a
 * fire's crackle a few pops, a night's cricket its chirps in threes — the same each time from the
 * same seed, all within the window. And the scene chooses its ambience by the ADR's rule.
 */
describe('a soundscape’s moments', () => {
  it('fall inside their window, the same from the same seed', () => {
    for (const make of [raindrops, crackles, chirps]) {
      const events = make(7, 4);
      expect(events).toEqual(make(7, 4));
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(event.at).toBeGreaterThanOrEqual(0);
        expect(event.at).toBeLessThan(4);
        expect(event.loudness).toBeGreaterThan(0);
        expect(event.loudness).toBeLessThanOrEqual(1);
        expect(Math.abs(event.pan)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('have the rain’s many drops, the fire’s few pops and the cricket’s threes', () => {
    expect(raindrops(3, 10).length).toBeGreaterThan(100);
    const pops = crackles(3, 10).length;
    expect(pops).toBeGreaterThan(5);
    expect(pops).toBeLessThan(60);
    expect(chirps(3, 10).length % 3).toBeLessThanOrEqual(2);
    expect(chirps(3, 10).length).toBeGreaterThan(20);
  });
});

describe('the ambience by the scene', () => {
  const outside = { setting: 'wild' as const, weather: 'clear' as const, night: false };
  it('is a fire inside, rain in the rain, night at night, a crowd in a town, else the wind', () => {
    expect(sceneAmbience({ ...outside, setting: 'indoors', weather: 'storm' })).toBe('fire');
    expect(sceneAmbience({ ...outside, setting: 'indoors', night: true })).toBe('fire');
    expect(sceneAmbience({ ...outside, weather: 'storm', night: true })).toBe('rain');
    expect(sceneAmbience({ ...outside, setting: 'town', night: true })).toBe('night');
    expect(sceneAmbience({ ...outside, setting: 'town' })).toBe('crowd');
    expect(sceneAmbience({ ...outside, weather: null })).toBe('wind');
    expect(sceneAmbience(outside)).toBe('wind');
  });

  it('follows the DM’s choice: none is silence, a scene unknown is silence, else the choice', () => {
    expect(ambienceFor('none', outside)).toBeNull();
    expect(ambienceFor('scene', null)).toBeNull();
    expect(ambienceFor('scene', { ...outside, weather: 'rain' })).toBe('rain');
    expect(ambienceFor('fire', null)).toBe('fire');
  });
});
