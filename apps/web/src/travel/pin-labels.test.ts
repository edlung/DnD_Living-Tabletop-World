import { describe, expect, it } from 'vitest';

import { pinSides } from './pin-labels.ts';

const frame = { width: 400, height: 300 };
const pin = (id: string, x: number, y: number, width = 90) => ({ id, x, y, width, height: 20 });

describe('pin names on a map', () => {
  it('go on the right, or on the left near the right edge', () => {
    expect(pinSides([pin('a', 40, 40), pin('b', 340, 200)], frame, null)).toEqual({
      a: { side: 'right', quiet: false },
      b: { side: 'left', quiet: false },
    });
  });

  it('take the other side when one is taken, and wait when both are', () => {
    // b's dot sits where a's name would go; c is boxed in by b's name and the map's edge.
    const sides = pinSides(
      [pin('a', 150, 100), pin('b', 210, 104), pin('c', 340, 100)],
      frame,
      null,
    );
    expect(sides).toEqual({
      a: { side: 'left', quiet: false },
      b: { side: 'right', quiet: false },
      // c waits, and its name would show on the side inside the map.
      c: { side: 'left', quiet: true },
    });
  });

  it('place where the party stands first', () => {
    const pins = [pin('a', 100, 100), pin('here', 160, 104)];
    expect(pinSides(pins, frame, 'here')).toMatchObject({
      here: { side: 'right', quiet: false },
      a: { quiet: true },
    });
  });

  it('always name where the party stands, even boxed in', () => {
    const pins = [pin('a', 150, 100), pin('here', 210, 104), pin('c', 340, 100)];
    expect(pinSides(pins, frame, 'here')['here']).toEqual({ side: 'right', quiet: false });
    expect(pinSides([pin('here', 60, 5)], frame, 'here')).toEqual({
      here: { side: 'right', quiet: false },
    });
  });

  it('never put a name off the map', () => {
    expect(pinSides([pin('a', 60, 5)], frame, null)['a']?.quiet).toBe(true);
  });
});
