import type { SessionReflections } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { openSession, starsOf, wishesOf } from './reflections.ts';

const session = (sessionId: string, open: boolean): SessionReflections => ({
  sessionId,
  title: sessionId,
  open,
  entries: [
    { author: { entityId: 'elowen', name: 'Elowen' }, star: 'The chase!', wish: 'Mine', own: true },
    { author: { entityId: 'brann', name: 'Brann' }, star: 'The bridge.', wish: null, own: false },
    { author: null, star: '', wish: 'A wish alone', own: true },
    { author: { entityId: 'maren', name: null }, star: 'A song.', wish: '', own: true },
  ],
});

describe('stars and wishes as a screen reads them', () => {
  it('finds the session still open for writing', () => {
    expect(openSession([session('two', true), session('one', false)])?.sessionId).toBe('two');
    expect(openSession([session('one', false)])).toBeNull();
    expect(openSession(null)).toBeNull();
  });

  it('lists the stars that were written, and only the wishes the reader may read', () => {
    const read = session('two', true);
    expect(starsOf(read).map((entry) => entry.star)).toEqual([
      'The chase!',
      'The bridge.',
      'A song.',
    ]);
    expect(wishesOf(read).map((entry) => entry.wish)).toEqual(['Mine', 'A wish alone']);
  });
});
