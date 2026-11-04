import { describe, expect, it } from 'vitest';

import { musicAfter, musicChangeSchema, musicPosition, type MusicPlaying } from './music.ts';

/**
 * The DM's music as the table's state keeps it (docs/adr/0059-atmosphere.md §3): when a track
 * started, where it paused, and where it is now — the same for every screen that asks.
 */
const TRACK = '3f1d6a2e-9c4b-4e1a-8f3d-2b7c9e5a1d40';
const at = (seconds: number) => Date.parse('2026-11-04T20:00:00.000Z') + seconds * 1000;

describe('the DM’s music', () => {
  it('starts, pauses where it is, resumes from there and stops', () => {
    const playing = musicAfter(null, { action: 'play', trackId: TRACK, repeat: true }, at(0));
    expect(playing).toEqual({
      trackId: TRACK,
      repeat: true,
      startedAt: '2026-11-04T20:00:00.000Z',
      pausedAt: null,
    });
    const paused = musicAfter(playing, { action: 'pause' }, at(90));
    expect(paused).toMatchObject({ startedAt: null, pausedAt: 90 });
    // A pause lasts: where it is stays where it paused.
    expect(paused && musicPosition(paused, at(500))).toBe(90);
    const resumed = musicAfter(paused, { action: 'resume' }, at(600));
    expect(resumed).toMatchObject({ startedAt: '2026-11-04T20:08:30.000Z', pausedAt: null });
    expect(resumed && musicPosition(resumed, at(610))).toBe(100);
    expect(musicAfter(resumed, { action: 'stop' }, at(700))).toBeNull();
  });

  it('changes nothing it cannot: a pause of nothing playing, a resume of nothing paused', () => {
    const playing: MusicPlaying = {
      trackId: TRACK,
      repeat: false,
      startedAt: '2026-11-04T20:00:00.000Z',
      pausedAt: null,
    };
    expect(musicAfter(null, { action: 'pause' }, at(10))).toBeNull();
    expect(musicAfter(playing, { action: 'resume' }, at(10))).toBe(playing);
    const paused = musicAfter(playing, { action: 'pause' }, at(10));
    expect(musicAfter(paused, { action: 'pause' }, at(20))).toBe(paused);
    // A screen whose clock runs behind never hears a time before the start.
    expect(musicPosition(playing, at(-5))).toBe(0);
  });

  it('takes only the four changes, a track by its ID', () => {
    expect(
      musicChangeSchema.safeParse({ action: 'play', trackId: TRACK, repeat: true }).success,
    ).toBe(true);
    expect(
      musicChangeSchema.safeParse({ action: 'play', trackId: 'tavern', repeat: true }).success,
    ).toBe(false);
    expect(musicChangeSchema.safeParse({ action: 'seek', at: 10 }).success).toBe(false);
  });
});
