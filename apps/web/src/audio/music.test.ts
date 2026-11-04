import type { MusicPlaying } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { musicPlan } from './music.ts';

/**
 * What a screen plays of the DM's music at a moment (docs/adr/0059-atmosphere.md §3): the same
 * place in the track on every screen, wrapped by the track's length when it repeats, nothing past
 * its end when it does not, and where it paused while paused.
 */
const start = Date.parse('2026-11-04T21:00:00.000Z');
const at = (seconds: number) => start + seconds * 1000;
const playing = (repeat: boolean): MusicPlaying => ({
  trackId: '3f1d6a2e-9c4b-4e1a-8f3d-2b7c9e5a1d40',
  repeat,
  startedAt: new Date(start).toISOString(),
  pausedAt: null,
});

describe('the music a screen plays', () => {
  it('is nothing without a track, and waits for the track’s length', () => {
    expect(musicPlan(null, at(5), 120)).toEqual({ kind: 'none' });
    expect(musicPlan(playing(true), at(5), null)).toEqual({ kind: 'loading', at: 5 });
    expect(musicPlan(playing(true), at(5), Number.NaN)).toEqual({ kind: 'loading', at: 5 });
  });

  it('plays from the same moment on every screen, around again when it repeats', () => {
    expect(musicPlan(playing(false), at(30), 120)).toEqual({ kind: 'playing', at: 30 });
    expect(musicPlan(playing(true), at(250), 120)).toEqual({ kind: 'playing', at: 10 });
    // Played once, it ends.
    expect(musicPlan(playing(false), at(120), 120)).toEqual({ kind: 'ended' });
  });

  it('holds where it paused', () => {
    const paused: MusicPlaying = { ...playing(true), startedAt: null, pausedAt: 130 };
    expect(musicPlan(paused, at(999), 120)).toEqual({ kind: 'paused', at: 10 });
  });
});
